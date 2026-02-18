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

// ✅ Datas por dia (UTC) pra ciclo ON/OFF
function toUtcDateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diffDaysUtc(a: Date, b: Date) {
  const ms = toUtcDateOnly(a).getTime() - toUtcDateOnly(b).getTime();
  return Math.floor(ms / 86400000);
}

@Injectable()
export class TimeentriesService {
  constructor(private readonly prisma: PrismaService) {}

  async punch(tenantId: string, data: any) {
    const { employeeId, siteId, type, latitude, longitude, selfieUrl, deviceId, deviceTs } = data || {};

    if (!employeeId || !siteId || !type || latitude === undefined || longitude === undefined) {
      throw new BadRequestException('Obrigatório: employeeId, siteId, type, latitude, longitude');
    }

    // ✅ Offline real: se vier um, tem que vir os dois
    const hasDeviceId = !!deviceId;
    const hasDeviceTs = !!deviceTs;
    if (hasDeviceId !== hasDeviceTs) {
      throw new BadRequestException('Offline: envie deviceId e deviceTs juntos');
    }

    // ✅ isOffline é decidido aqui (não confiar no client)
    const computedIsOffline = hasDeviceId && hasDeviceTs;

    // ✅ parse seguro do deviceTs
    const parsedDeviceTs = computedIsOffline ? new Date(deviceTs) : null;
    if (computedIsOffline && (!parsedDeviceTs || Number.isNaN(parsedDeviceTs.getTime()))) {
      throw new BadRequestException('deviceTs inválido (use ISO string ou timestamp)');
    }

    // ✅ “agora” efetivo: online usa now(), offline usa deviceTs
    const effectiveNow = computedIsOffline ? parsedDeviceTs! : new Date();

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, isActive: true },
    });
    if (!emp) throw new NotFoundException('Funcionário inválido');

    // ✅ Validação de escala (Schedule) — principalmente SHIFT_CYCLE (quinzenal etc.)
    if (emp.scheduleId) {
      const schedule = await this.prisma.schedule.findFirst({
        where: { id: emp.scheduleId, tenantId, isActive: true },
      });
      if (!schedule) {
        throw new BadRequestException('Escala vinculada inválida ou inativa');
      }

      // SHIFT_CYCLE: valida se hoje está dentro do ciclo ON/OFF
      if (schedule.type === 'SHIFT_CYCLE') {
        if (!emp.scheduleStartAt) {
          throw new BadRequestException('Escala exige scheduleStartAt no funcionário');
        }

        const onDays = Number(schedule.onDays ?? 0);
        const offDays = Number(schedule.offDays ?? 0);
        const cycleLen = onDays + offDays;

        if (!onDays || cycleLen <= 0) {
          throw new BadRequestException('Escala SHIFT_CYCLE inválida: configure onDays/offDays');
        }

        const startAt = new Date(emp.scheduleStartAt);
        if (Number.isNaN(startAt.getTime())) {
          throw new BadRequestException('scheduleStartAt inválido no funcionário');
        }

        // anchorWeekday (0=Dom .. 6=Sáb): exige que startAt caia no dia âncora
        if (schedule.anchorWeekday !== null && schedule.anchorWeekday !== undefined) {
          const aw = Number(schedule.anchorWeekday);
          const dow = startAt.getUTCDay();
          if (dow !== aw) {
            throw new BadRequestException(
              `Escala inválida: scheduleStartAt deve cair no dia âncora (anchorWeekday=${aw}). ` +
                `startAt está em dow=${dow}. Ajuste o startAt.`,
            );
          }
        }

        const daysSince = diffDaysUtc(effectiveNow, startAt);

        // Ainda não começou
        if (daysSince < 0) {
          throw new BadRequestException('Escala ainda não iniciou para este funcionário');
        }

        const pos = daysSince % cycleLen;
        const isWorkDay = pos < onDays;

        if (!isWorkDay) {
          throw new BadRequestException('Fora do dia de trabalho pela escala (SHIFT_CYCLE)');
        }
      }

      // flexTime: hoje seu punch() não valida hora fixa, então não precisa mudar nada aqui.
      // Quando você adicionar validação de horário, basta pular se schedule.flexTime === true.
    }

    const site = await this.prisma.workSite.findFirst({
      where: { id: siteId, tenantId, isActive: true },
    });
    if (!site) throw new NotFoundException('Local inválido');

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      throw new BadRequestException('latitude/longitude inválidos');
    }

    const dist = haversineMeters(lat, lon, site.latitude, site.longitude);

    if (dist > site.radiusM) {
      throw new BadRequestException(
        `Fora do local permitido. Distância: ${dist}m (limite ${site.radiusM}m)`,
      );
    }

    if (site.requireSelfie && !selfieUrl) {
      throw new BadRequestException('Selfie obrigatória neste local');
    }

    // ✅ Regras: sequência + anti-duplicidade (online e offline)
    const last = await this.prisma.timeEntry.findFirst({
      where: { tenantId, employeeId },
      orderBy: { punchedAt: 'desc' },
      select: { type: true, punchedAt: true },
    });

    // janela anti-duplicidade (segundos)
    const DUP_WINDOW_SEC = 120;

    if (last) {
      const now = effectiveNow;
      const diffSec = Math.floor((now.getTime() - new Date(last.punchedAt).getTime()) / 1000);

      // 1) mesma batida muito rápida
      if (last.type === type && diffSec >= 0 && diffSec < DUP_WINDOW_SEC) {
        throw new BadRequestException(`Batida repetida muito rápida. Aguarde ${DUP_WINDOW_SEC - diffSec}s`);
      }

      // 2) sequência completa: IN -> LUNCH_OUT -> LUNCH_IN -> OUT

      // Se último foi OUT, novo ciclo só começa com IN
      if (last.type === 'OUT' && type !== 'IN') {
        throw new BadRequestException('Sequência inválida: após OUT, a próxima batida deve ser IN.');
      }

      // Se último foi IN, pode ir para LUNCH_OUT ou OUT (mas não IN nem LUNCH_IN)
      if (last.type === 'IN' && (type === 'IN' || type === 'LUNCH_IN')) {
        throw new BadRequestException('Sequência inválida: após IN, faça LUNCH_OUT (opcional) ou OUT.');
      }

      // Se último foi LUNCH_OUT, próximo obrigatoriamente é LUNCH_IN
      if (last.type === 'LUNCH_OUT' && type !== 'LUNCH_IN') {
        throw new BadRequestException('Sequência inválida: após LUNCH_OUT, a próxima batida deve ser LUNCH_IN.');
      }

      // Se último foi LUNCH_IN, pode ir para OUT (mas não IN, nem LUNCH_OUT, nem LUNCH_IN)
      if (last.type === 'LUNCH_IN' && type !== 'OUT') {
        throw new BadRequestException('Sequência inválida: após LUNCH_IN, a próxima batida deve ser OUT.');
      }
    } else {
      // ✅ Primeira batida da vida do funcionário tem que ser IN
      if (type !== 'IN') {
        throw new BadRequestException('Sequência inválida: a primeira batida deve ser IN.');
      }
    }

    // ✅ Idempotência offline via constraint unique (quando existir no Prisma)
    try {
      const entry = await this.prisma.timeEntry.create({
  data: {
    tenantId,
    employeeId,
    siteId,
    type,
    punchedAt: effectiveNow, // ✅ offline usa deviceTs, online usa agora
    latitude: lat,
    longitude: lon,
    distanceM: dist,
    selfieUrl: selfieUrl ?? null,
    deviceId: computedIsOffline ? String(deviceId) : null,
    deviceTs: computedIsOffline ? parsedDeviceTs : null,
    isOffline: computedIsOffline,
  },
});


      return { ok: true, entry, deduped: false };
    } catch (e: any) {
      // Prisma unique violation
      if (computedIsOffline && e?.code === 'P2002') {
        const existing = await this.prisma.timeEntry.findFirst({
          where: {
            tenantId,
            employeeId,
            siteId,
            type,
            deviceId: String(deviceId),
            deviceTs: parsedDeviceTs!,
          },
        });

        if (existing) return { ok: true, entry: existing, deduped: true };
      }
      throw e;
    }
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
