import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorksitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.workSite.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, data: any) {
    if (!data?.name || data?.latitude === undefined || data?.longitude === undefined) {
      throw new BadRequestException('Campos obrigatórios: name, latitude, longitude');
    }

    return this.prisma.workSite.create({
      data: {
        tenantId,
        name: data.name,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radiusM: data.radiusM ?? 150,
        requireSelfie: data.requireSelfie ?? true,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const site = await this.prisma.workSite.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException('Local não encontrado');

    return this.prisma.workSite.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        latitude: data.latitude !== undefined ? Number(data.latitude) : undefined,
        longitude: data.longitude !== undefined ? Number(data.longitude) : undefined,
        radiusM: data.radiusM ?? undefined,
        requireSelfie: data.requireSelfie ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const site = await this.prisma.workSite.findFirst({ where: { id, tenantId } });
    if (!site) throw new NotFoundException('Local não encontrado');

    await this.prisma.workSite.delete({ where: { id } });
    return { ok: true };
  }
}
