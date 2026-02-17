import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

@Injectable()
export class TimeentriesService {
  constructor(private readonly prisma: PrismaService) {}

  async punch(tenantId: string, data: any) {
    const { employeeId, siteId, type, latitude, longitude, selfieUrl, deviceId, deviceTs, isOffline } = data || {};

    if (!employeeId || !siteId || !type || latitude === undefined || longitude === undefined) {
      throw new BadRequestException('Obrigatório: employeeId, siteId, type, latitude, longitude');
    }

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, isActive: true },
    });
    if (!emp) throw new NotFoundException('Funcionário inválido');

    const site = await this.prisma.workSite.findFirst({
      where: { id: siteId, tenantId, isActive: true },
    });
    if (!site) throw new NotFoundException('Local inválido');

    const lat = Number(latitude);
    const lon = Number(longitude);

    const dist = haversineMeters(lat, lon, site.latitude, site.longitude);

    if (dist > site.radiusM) {
      throw new BadRequestException(`Fora do local permitido. Distância: ${dist}m (limite ${site.radiusM}m)`);
    }

    if (site.requireSelfie && !selfieUrl) {
      throw new BadRequestException('Selfie obrigatória neste local');
    }

    const entry = await this.prisma.timeEntry.create({
      data: {
        tenantId,
        employeeId,
        siteId,
        type,
        latitude: lat,
        longitude: lon,
        distanceM: dist,
        selfieUrl: selfieUrl ?? null,
        deviceId: deviceId ?? null,
        deviceTs: deviceTs ? new Date(deviceTs) : null,
        isOffline: !!isOffline,
      },
    });

    return { ok: true, entry };
  }

  async list(tenantId: string, q: any) {
    const employeeId = q?.employeeId;
    const from = q?.from ? new Date(q.from) : undefined;
    const to = q?.to ? new Date(q.to) : undefined;

    return this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        employeeId: employeeId ?? undefined,
        punchedAt: { gte: from, lte: to },
      },
      orderBy: { punchedAt: 'desc' },
      include: { employee: true, site: true },
    });
  }
}
