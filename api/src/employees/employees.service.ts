import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.employee.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, data: any) {
    if (!data?.name || !data?.cpf || !data?.workStart || !data?.workEnd) {
      throw new BadRequestException('Campos obrigatórios: name, cpf, workStart, workEnd');
    }

    const cpf = String(data.cpf).replace(/\D/g, '');
    if (cpf.length !== 11) throw new BadRequestException('CPF inválido');

    try {
      const emp = await this.prisma.employee.create({
        data: {
          tenantId,
          name: data.name,
          cpf,
          phone: data.phone ?? null,
          email: data.email ?? null,
          workStart: data.workStart,
          lunchStart: data.lunchStart ?? null,
          lunchEnd: data.lunchEnd ?? null,
          workEnd: data.workEnd,
          isActive: data.isActive ?? true,
        },
      });
      return { ok: true, employee: emp };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('CPF já cadastrado nessa empresa');
      throw e;
    }
  }

  async update(tenantId: string, id: string, data: any) {
    const emp = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    const cpf = data?.cpf ? String(data.cpf).replace(/\D/g, '') : undefined;
    if (cpf && cpf.length !== 11) throw new BadRequestException('CPF inválido');

    try {
      const updateData: any = {
  name: data.name ?? undefined,
  cpf: cpf ?? undefined,
  phone: data.phone ?? undefined,
  email: data.email ?? undefined,

  workStart: data.workStart ?? undefined,
  lunchStart: data.lunchStart ?? undefined,
  lunchEnd: data.lunchEnd ?? undefined,
  workEnd: data.workEnd ?? undefined,

  isActive: data.isActive ?? undefined,

  // ✅ permitir vincular escala no employee
  scheduleId: data.scheduleId ?? undefined,
  scheduleStartAt:
    data.scheduleStartAt !== undefined
      ? (data.scheduleStartAt ? new Date(data.scheduleStartAt) : null)
      : undefined,
};

// ✅ update seguro por tenant (sem precisar @@unique composto)
const result = await this.prisma.employee.updateMany({
  where: { id, tenantId },
  data: updateData,
});

if (result.count === 0) throw new NotFoundException('Funcionário não encontrado');

const updated = await this.prisma.employee.findFirst({
  where: { id, tenantId },
});

return { ok: true, employee: updated };

      return { ok: true, employee: updated };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('CPF já cadastrado nessa empresa');
      throw e;
    }
  }

  async remove(tenantId: string, id: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id, tenantId } });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    await this.prisma.employee.delete({ where: { id } });
    return { ok: true };
  }
}
