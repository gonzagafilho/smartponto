import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function parseYearMonthOrThrow(v: string): { ym: string; year: number; month: number } {
  const s = (v || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) throw new BadRequestException("month inválido. Use YYYY-MM");
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException("month inválido. Use YYYY-MM");
  }
  return { ym: s, year, month };
}

function dayKeyInTz(d: Date, timeZone: string): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isWeekendInTz(d: Date, timeZone: string): boolean {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return wd === "Sat" || wd === "Sun";
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type DayDetail = {
  date: string; // YYYY-MM-DD (TZ do tenant)
  firstIn: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  workedHHMM: string;
  flags: string[];
  punches: Array<{ type: string; punchedAt: string; isOffline: boolean; deviceId: string | null }>;
};

@Injectable()
export class MonthlyService {
  constructor(private readonly prisma: PrismaService) {}

  async monthlySummary(params: { tenantId: string; employeeId: string; month: string }) {
    const tenantId = params.tenantId;
    const employeeId = (params.employeeId || "").trim();
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");

    const { ym, year, month } = parseYearMonthOrThrow(params.month);

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, name: true, cpf: true, isActive: true },
    });
    if (!emp) throw new NotFoundException("Funcionário não encontrado");
    if (!emp.isActive) throw new BadRequestException("Funcionário inativo");

    // ✅ Se já existe resumo fechado, retorna SEM sobrescrever
    const existing = await this.prisma.monthlySummary.findUnique({
      where: {
        uniq_monthly_summary: {
          tenantId,
          employeeId,
          yearMonth: ym,
        },
      },
    });

    if (existing?.closedAt) {
      const payload = existing.detailsJson as any;

      // Se temos o payload completo salvo, devolve ele
      if (payload && typeof payload === "object") {
        return {
          ...payload,
          persisted: true,
          generatedAt: existing.generatedAt.toISOString(),
          closedAt: existing.closedAt.toISOString(),
        };
      }

      // fallback mínimo (caso detailsJson esteja vazio)
      return {
        ok: true,
        employee: emp,
        month: ym,
        totals: {
          targetMinutes: existing.targetMinutes,
          targetHHMM: minutesToHHMM(existing.targetMinutes),
          workedMinutes: existing.workedMinutes,
          workedHHMM: minutesToHHMM(existing.workedMinutes),
          extraMinutes: existing.extraMinutes,
          extraHHMM: minutesToHHMM(existing.extraMinutes),
          debitMinutes: existing.debitMinutes,
          debitHHMM: minutesToHHMM(existing.debitMinutes),
          daysWorked: existing.daysWorked,
          daysExpected: null,
          inconsistenciesCount: existing.inconsistenciesCount,
        },
        days: [],
        persisted: true,
        generatedAt: existing.generatedAt.toISOString(),
        closedAt: existing.closedAt.toISOString(),
      };
    }

    const settings = await this.prisma.tenantSettings.findFirst({
      where: { tenantId },
    });

    const timeZone = settings?.timezone || "America/Sao_Paulo";
    const targetMode = (settings?.targetMode as any) || "MONTHLY";
    const targetDailyMinutes = settings?.targetDailyMinutes ?? 480;
    const targetMonthlyMinutes = settings?.targetMonthlyMinutes ?? 13200;
    const lunchDeductMode = (settings?.lunchDeductMode as any) || "BY_PUNCH";
    const fixedLunchMinutes = settings?.fixedLunchMinutes ?? 60;
    const roundingMinutes = settings?.roundingMinutes ?? 0;

    // Busca UTC do mês (amplo). Agrupamento será no fuso do tenant.
    const startUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const rows = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        employeeId,
        punchedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { punchedAt: "asc" },
      select: {
        type: true,
        punchedAt: true,
        isOffline: true,
        deviceId: true,
      },
    });

    // Agrupar por dia no TZ do tenant
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = dayKeyInTz(r.punchedAt, timeZone);
      const arr = byDay.get(key) || [];
      arr.push(r);
      byDay.set(key, arr);
    }

    // Days expected (somente se modo DAILY; por padrão, dias úteis)
    let daysExpected = 0;
    if (targetMode === "DAILY") {
      for (let d = new Date(startUtc.getTime()); d.getTime() < endUtc.getTime(); ) {
        if (!isWeekendInTz(d, timeZone)) daysExpected++;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const details: DayDetail[] = [];
    let inconsistenciesCount = 0;

    for (const [date, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const flags: string[] = [];
      const punches = list.map((p) => ({
        type: p.type,
        punchedAt: p.punchedAt.toISOString(),
        isOffline: !!p.isOffline,
        deviceId: p.deviceId,
      }));

      const firstIn = list.find((p) => p.type === "IN")?.punchedAt ?? null;
      const lunchOut = list.find((p) => p.type === "LUNCH_OUT")?.punchedAt ?? null;
      const lunchIn = list.find((p) => p.type === "LUNCH_IN")?.punchedAt ?? null;
      const lastOut = [...list].reverse().find((p) => p.type === "OUT")?.punchedAt ?? null;

      // Inconsistências
      if (firstIn && !lastOut) flags.push("MISSING_OUT");
      if (!firstIn && lastOut) flags.push("MISSING_IN");
      if (lunchOut && !lunchIn) flags.push("MISSING_LUNCH_IN");
      if (!lunchOut && lunchIn) flags.push("MISSING_LUNCH_OUT");

      if (flags.length > 0) inconsistenciesCount += 1;

      let workedMinutes = 0;

      if (firstIn && lastOut && lastOut.getTime() > firstIn.getTime()) {
        // Base: OUT - IN
        workedMinutes = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60000);

        if (lunchDeductMode === "BY_PUNCH") {
          if (lunchOut && lunchIn && lunchIn.getTime() > lunchOut.getTime()) {
            workedMinutes -= Math.floor((lunchIn.getTime() - lunchOut.getTime()) / 60000);
          } else if (lunchOut || lunchIn) {
            // almoço incompleto: não desconta e marca flag
            flags.push("LUNCH_INCOMPLETE_NO_DEDUCT");
          }
        } else {
          // FIXED
          workedMinutes -= fixedLunchMinutes;
        }
      } else {
        workedMinutes = 0;
      }

      if (workedMinutes < 0) workedMinutes = 0;

      // Arredondamento opcional por dia
      if (roundingMinutes && roundingMinutes > 0) {
        workedMinutes = Math.round(workedMinutes / roundingMinutes) * roundingMinutes;
      }

      details.push({
        date,
        firstIn: firstIn ? firstIn.toISOString() : null,
        lunchOut: lunchOut ? lunchOut.toISOString() : null,
        lunchIn: lunchIn ? lunchIn.toISOString() : null,
        lastOut: lastOut ? lastOut.toISOString() : null,
        workedMinutes,
        workedHHMM: minutesToHHMM(workedMinutes),
        flags,
        punches,
      });
    }

    const workedTotal = details.reduce((acc, d) => acc + d.workedMinutes, 0);

    const targetMinutes =
      targetMode === "MONTHLY" ? targetMonthlyMinutes : targetDailyMinutes * daysExpected;

    const delta = workedTotal - targetMinutes;
    const extraMinutes = delta > 0 ? delta : 0;
    const debitMinutes = delta < 0 ? Math.abs(delta) : 0;

    // ✅ payload completo (o que será salvo no detailsJson)
    const payload: any = {
      ok: true,
      employee: emp,
      settings: {
        timezone: timeZone,
        targetMode,
        targetDailyMinutes,
        targetMonthlyMinutes,
        lunchDeductMode,
        fixedLunchMinutes,
        roundingMinutes,
      },
      month: ym,
      rangeUtc: { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() },
      totals: {
        targetMinutes,
        targetHHMM: minutesToHHMM(targetMinutes),
        workedMinutes: workedTotal,
        workedHHMM: minutesToHHMM(workedTotal),
        extraMinutes,
        extraHHMM: minutesToHHMM(extraMinutes),
        debitMinutes,
        debitHHMM: minutesToHHMM(debitMinutes),
        daysWorked: details.filter((d) => d.workedMinutes > 0).length,
        daysExpected: targetMode === "DAILY" ? daysExpected : null,
        inconsistenciesCount,
      },
      days: details,
    };

    const now = new Date();

    // ✅ Upsert (persistência) — NÃO mexe no closedAt
    const saved = await this.prisma.monthlySummary.upsert({
      where: {
        uniq_monthly_summary: {
          tenantId,
          employeeId,
          yearMonth: ym,
        },
      },
      create: {
        tenantId,
        employeeId,
        yearMonth: ym,

        targetMinutes,
        workedMinutes: workedTotal,
        extraMinutes,
        debitMinutes,

        daysWorked: payload.totals.daysWorked,
        inconsistenciesCount,

        detailsJson: payload,
        generatedAt: now,
      },
      update: {
        targetMinutes,
        workedMinutes: workedTotal,
        extraMinutes,
        debitMinutes,

        daysWorked: payload.totals.daysWorked,
        inconsistenciesCount,

        detailsJson: payload,
        generatedAt: now,
      },
    });

    return {
      ...payload,
      persisted: true,
      generatedAt: saved.generatedAt.toISOString(),
      closedAt: saved.closedAt ? saved.closedAt.toISOString() : null,
    };
  }

  async closeMonthlySummary(params: { tenantId: string; employeeId: string; month: string }) {
    const tenantId = params.tenantId;
    const employeeId = (params.employeeId || "").trim();
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");

    const { ym } = parseYearMonthOrThrow(params.month);

    // garante que existe e que está persistido (se já estiver fechado, monthlySummary retorna o fechado)
    await this.monthlySummary({ tenantId, employeeId, month: ym });

    const existing = await this.prisma.monthlySummary.findUnique({
      where: {
        uniq_monthly_summary: { tenantId, employeeId, yearMonth: ym },
      },
    });

    if (!existing) throw new NotFoundException("Resumo mensal não encontrado");

    // se já está fechado, só devolve
    if (existing.closedAt) {
      const payload = existing.detailsJson as any;
      if (payload && typeof payload === "object") {
        return {
          ...payload,
          persisted: true,
          generatedAt: existing.generatedAt.toISOString(),
          closedAt: existing.closedAt.toISOString(),
        };
      }
      return {
        ok: true,
        tenantId,
        employeeId,
        month: ym,
        closedAt: existing.closedAt.toISOString(),
        generatedAt: existing.generatedAt.toISOString(),
      };
    }

    const updated = await this.prisma.monthlySummary.update({
      where: {
        uniq_monthly_summary: { tenantId, employeeId, yearMonth: ym },
      },
      data: { closedAt: new Date() },
    });

    const payload = updated.detailsJson as any;
    if (payload && typeof payload === "object") {
      return {
        ...payload,
        persisted: true,
        generatedAt: updated.generatedAt.toISOString(),
        closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
      };
    }

    return {
      ok: true,
      tenantId,
      employeeId,
      month: ym,
      persisted: true,
      generatedAt: updated.generatedAt.toISOString(),
      closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
    };
  }
}