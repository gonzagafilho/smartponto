import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function isHHMM(v?: string) {
  if (!v) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function toIntArray(v: any): number[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (typeof v === "string") {
    return v
      .split(/[, ]+/g)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

function normalizeType(raw: any): "FIXED_DAILY" | "WEEKLY_SHIFT" | "SHIFT_CYCLE" {
  const t = String(raw || "").trim().toUpperCase();

  // compatibilidade (se ainda vier do front antigo)
  if (t === "FIXED_HOURS") return "FIXED_DAILY";
  if (t === "ROTATION") return "SHIFT_CYCLE";

  if (t === "FIXED_DAILY") return "FIXED_DAILY";
  if (t === "WEEKLY_SHIFT") return "WEEKLY_SHIFT";
  if (t === "SHIFT_CYCLE") return "SHIFT_CYCLE";

  return "FIXED_DAILY";
}

function requirePositiveInt(name: string, v: any) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${name} deve ser > 0`);
  if (!Number.isInteger(n)) throw new BadRequestException(`${name} deve ser inteiro`);
  return n;
}

function optionalIntOrNull(v: any) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.schedule.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(tenantId: string, body: any) {
    const name = (body?.name || "").trim();
    if (!name) throw new BadRequestException("name é obrigatório");

    const type = normalizeType(body?.type);
    const isActive = body?.isActive ?? true;

    // FIXED_DAILY / WEEKLY_SHIFT
    const workStart = body?.workStart ?? null;
    const workEnd = body?.workEnd ?? null;
    const lunchStart = body?.lunchStart ?? null;
    const lunchEnd = body?.lunchEnd ?? null;
    const daysOfWeek = toIntArray(body?.daysOfWeek);

    // SHIFT_CYCLE
    const onDays = body?.onDays ?? null;
    const offDays = body?.offDays ?? null;

    // FLEX
    const flexTime = !!body?.flexTime;
    const anchorWeekday = optionalIntOrNull(body?.anchorWeekday); // 0..6
    const maxSpanHours = optionalIntOrNull(body?.maxSpanHours); // opcional

    // validações
    if (type === "FIXED_DAILY") {
      if (!flexTime) {
        if (!isHHMM(workStart) || !isHHMM(workEnd)) {
          throw new BadRequestException("FIXED_DAILY exige workStart e workEnd (HH:mm) ou flexTime=true");
        }
        if (lunchStart && !isHHMM(lunchStart)) throw new BadRequestException("lunchStart inválido (HH:mm)");
        if (lunchEnd && !isHHMM(lunchEnd)) throw new BadRequestException("lunchEnd inválido (HH:mm)");
      }
      // daysOfWeek opcional aqui
    }

    if (type === "WEEKLY_SHIFT") {
      if (!flexTime) {
        if (!isHHMM(workStart) || !isHHMM(workEnd)) {
          throw new BadRequestException("WEEKLY_SHIFT exige workStart e workEnd (HH:mm) ou flexTime=true");
        }
      }
      if (!daysOfWeek.length) {
        throw new BadRequestException("WEEKLY_SHIFT exige daysOfWeek (ex: [1,2,3,4,5])");
      }
      for (const d of daysOfWeek) {
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          throw new BadRequestException("daysOfWeek deve conter números 0..6 (0=Dom ... 6=Sáb)");
        }
      }
    }

    if (type === "SHIFT_CYCLE") {
      const on = requirePositiveInt("onDays", onDays);
      const off = requirePositiveInt("offDays", offDays);

      if (flexTime) {
        if (anchorWeekday !== null && (anchorWeekday < 0 || anchorWeekday > 6)) {
          throw new BadRequestException("anchorWeekday deve ser 0..6");
        }
        if (maxSpanHours !== null && maxSpanHours <= 0) {
          throw new BadRequestException("maxSpanHours deve ser > 0");
        }
      }

      // só pra evitar variável não usada
      void on;
      void off;
    }

    // nome único
    const exists = await this.prisma.schedule.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    if (exists) throw new BadRequestException("Já existe uma escala com esse nome");

    // data pro prisma (só campos do schema)
    const data: any = {
      tenantId,
      name,
      type,
      isActive: !!isActive,

      workStart: null,
      workEnd: null,
      lunchStart: null,
      lunchEnd: null,

      daysOfWeek: [],

      onDays: null,
      offDays: null,

      flexTime,
      anchorWeekday: anchorWeekday ?? null,
      maxSpanHours: maxSpanHours ?? null,
    };

    if (type === "FIXED_DAILY") {
      data.workStart = flexTime ? null : workStart;
      data.workEnd = flexTime ? null : workEnd;
      data.lunchStart = flexTime ? null : (lunchStart || null);
      data.lunchEnd = flexTime ? null : (lunchEnd || null);
      data.daysOfWeek = daysOfWeek; // opcional
    }

    if (type === "WEEKLY_SHIFT") {
      data.workStart = flexTime ? null : workStart;
      data.workEnd = flexTime ? null : workEnd;
      data.lunchStart = flexTime ? null : (lunchStart || null);
      data.lunchEnd = flexTime ? null : (lunchEnd || null);
      data.daysOfWeek = daysOfWeek;
    }

    if (type === "SHIFT_CYCLE") {
      data.onDays = Number(onDays);
      data.offDays = Number(offDays);
    }

    const schedule = await this.prisma.schedule.create({ data });
    return { ok: true, schedule };
  }

  async update(tenantId: string, id: string, body: any) {
    const found = await this.prisma.schedule.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException("Escala não encontrada");

    const patch: any = {};

    if (body?.name !== undefined) {
      const name = (body.name || "").trim();
      if (!name) throw new BadRequestException("name inválido");
      patch.name = name;
    }

    if (body?.isActive !== undefined) patch.isActive = !!body.isActive;

    if (body?.flexTime !== undefined) patch.flexTime = !!body.flexTime;

    if (body?.anchorWeekday !== undefined) {
      const n = optionalIntOrNull(body.anchorWeekday);
      if (n !== null && (n < 0 || n > 6)) throw new BadRequestException("anchorWeekday deve ser 0..6");
      patch.anchorWeekday = n;
    }

    if (body?.maxSpanHours !== undefined) {
      const n = optionalIntOrNull(body.maxSpanHours);
      if (n !== null && n <= 0) throw new BadRequestException("maxSpanHours deve ser > 0");
      patch.maxSpanHours = n;
    }

    // não mudamos type aqui.

    if (found.type === "FIXED_DAILY" || found.type === "WEEKLY_SHIFT") {
      if (body?.workStart !== undefined) {
        if (body.workStart && !isHHMM(body.workStart)) throw new BadRequestException("workStart inválido (HH:mm)");
        patch.workStart = body.workStart || null;
      }
      if (body?.workEnd !== undefined) {
        if (body.workEnd && !isHHMM(body.workEnd)) throw new BadRequestException("workEnd inválido (HH:mm)");
        patch.workEnd = body.workEnd || null;
      }
      if (body?.lunchStart !== undefined) {
        if (body.lunchStart && !isHHMM(body.lunchStart)) throw new BadRequestException("lunchStart inválido (HH:mm)");
        patch.lunchStart = body.lunchStart || null;
      }
      if (body?.lunchEnd !== undefined) {
        if (body.lunchEnd && !isHHMM(body.lunchEnd)) throw new BadRequestException("lunchEnd inválido (HH:mm)");
        patch.lunchEnd = body.lunchEnd || null;
      }

      if (found.type === "WEEKLY_SHIFT" && body?.daysOfWeek !== undefined) {
        const days = toIntArray(body.daysOfWeek);
        if (!days.length) throw new BadRequestException("daysOfWeek não pode ficar vazio no WEEKLY_SHIFT");
        for (const d of days) {
          if (!Number.isInteger(d) || d < 0 || d > 6) throw new BadRequestException("daysOfWeek deve ser 0..6");
        }
        patch.daysOfWeek = days;
      }
    }

    if (found.type === "SHIFT_CYCLE") {
      if (body?.onDays !== undefined) patch.onDays = requirePositiveInt("onDays", body.onDays);
      if (body?.offDays !== undefined) patch.offDays = requirePositiveInt("offDays", body.offDays);
    }

    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: patch,
    });

    return { ok: true, schedule };
  }

  async remove(tenantId: string, id: string) {
    const found = await this.prisma.schedule.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException("Escala não encontrada");

    const inUse = await this.prisma.employee.findFirst({
      where: { tenantId, scheduleId: id },
      select: { id: true },
    });
    if (inUse) throw new BadRequestException("Não pode apagar: existe funcionário usando esta escala");

    await this.prisma.schedule.delete({ where: { id } });
    return { ok: true };
  }
}

