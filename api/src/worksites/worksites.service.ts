import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorksitesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna a assinatura ativa do tenant (TRIAL ou ACTIVE) com o plano.
   * Usado para verificar limite de obras antes de criar.
   */
  private async getActiveSubscriptionWithPlan(tenantId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['TRIAL', 'ACTIVE'] },
      },
      orderBy: { startedAt: 'desc' },
      include: {
        plan: { select: { code: true, name: true, maxWorksites: true } },
      },
    });
  }

  async list(tenantId: string) {
    return this.prisma.worksite.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, data: any) {
    if (!data?.name || data?.latitude === undefined || data?.longitude === undefined) {
      throw new BadRequestException('Campos obrigatórios: name, latitude, longitude');
    }

    const subscription = await this.getActiveSubscriptionWithPlan(tenantId);
    if (!subscription) {
      throw new BadRequestException(
        'Nenhuma assinatura ativa encontrada para esta empresa. Entre em contato com o suporte.',
      );
    }

    const { plan } = subscription;
    if (plan.maxWorksites != null) {
      const currentCount = await this.prisma.worksite.count({
        where: { tenantId, isActive: true },
      });
      if (currentCount >= plan.maxWorksites) {
        throw new BadRequestException(
          `Limite de obras do plano ${plan.name} (${plan.maxWorksites}) atingido. Faça upgrade para continuar.`,
        );
      }
    }

    return this.prisma.worksite.create({
      data: {
        tenantId,
        name: data.name,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radiusMeters: data.radiusMeters ?? 150,
        requireSelfie: data.requireSelfie ?? true,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const site = await this.prisma.worksite.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException('Local não encontrado');

    return this.prisma.worksite.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        latitude: data.latitude !== undefined ? Number(data.latitude) : undefined,
        longitude: data.longitude !== undefined ? Number(data.longitude) : undefined,
        radiusMeters: data.radiusMeters ?? undefined,
        requireSelfie: data.requireSelfie ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const site = await this.prisma.worksite.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException('Local não encontrado');

    await this.prisma.worksite.delete({ where: { id } });
    return { ok: true };
  }
}
