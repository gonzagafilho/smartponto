import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function isValidDate(d: any) {
  const dt = new Date(d);
  return !Number.isNaN(dt.getTime());
}

@Injectable()
export class EmployeeSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, employeeId?: string) {
    return this.prisma.employeeSchedule.findMany({
      where: {
        tenantId,
        employeeId: employeeId ?? undefined,
      },
      orderBy: { startAt: 'desc' },
      include: { schedule: true },
    });
  }

  /**
   * Cria um vínculo de escala por período.
   * Regra SaaS:
   * - startAt obrigatório
   * - não permitir sobreposição com outro vínculo do mesmo funcionário
   * - se existir vínculo ativo, encerra o anterior (endAt = startAt - 1ms)
   */
  async create(tenantId: string, data: any) {
    const employeeId = data?.employeeId;
    const scheduleId = data?.scheduleId;
    const startAtRaw = data?.startAt;

    if (!employeeId || !scheduleId || !startAtRaw) {
      throw new BadRequestException('Obrigatório: employeeId, scheduleId, startAt');
    }
    if (!isValidDate(startAtRaw)) {
      throw new BadRequestException('startAt inválido (use ISO)');
    }

    const startAt = new Date(startAtRaw);

    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    const sched = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenantId, isActive: true },
    });
    if (!sched) throw new NotFoundException('Escala não encontrada');

    // 1) Se já existe um vínculo ativo que começa antes e não terminou, encerra ele
    const active = await this.prisma.employeeSchedule.findFirst({
      where: {
        tenantId,
        employeeId,
        startAt: { lte: startAt },
        OR: [{ endAt: null }, { endAt: { gt: startAt } }],
      },
      orderBy: { startAt: 'desc' },
    });

    // 2) Não permitir outro vínculo com startAt igual (unique também segura)
    const sameStart = await this.prisma.employeeSchedule.findFirst({
      where: { tenantId, employeeId, startAt },
    });
    if (sameStart) {
      throw new BadRequestException('Já existe vínculo de escala com esse startAt');
    }

    return this.prisma.$transaction(async (tx) => {
      if (active) {
        // encerra no instante anterior ao novo startAt
        const endAt = new Date(startAt.getTime() - 1);
        await tx.employeeSchedule.update({
          where: { id: active.id },
          data: { endAt },
        });
      }

      const created = await tx.employeeSchedule.create({
        data: {
          tenantId,
          employeeId,
          scheduleId,
          startAt,
          endAt: null,
        },
        include: { schedule: true },
      });

      return { ok: true, employeeSchedule: created };
    });
  }

  /**
   * Retorna o vínculo ativo para uma data/hora (effectiveNow).
   * Usado no punch.
   */
  async getActiveForDate(tenantId: string, employeeId: string, at: Date) {
    return this.prisma.employeeSchedule.findFirst({
      where: {
        tenantId,
        employeeId,
        startAt: { lte: at },
        OR: [{ endAt: null }, { endAt: { gte: at } }],
      },
      orderBy: { startAt: 'desc' },
      include: { schedule: true },
    });
  }
}
