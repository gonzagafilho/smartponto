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

type PunchRow = { type: string; punchedAt: Date; employeeId?: string };

type DayDetail = {
  date: string;
  firstIn: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  workedHHMM: string;
  flags: string[];
};

type Settings = {
  timezone: string;
  targetMode: string;
  targetDailyMinutes: number;
  targetMonthlyMinutes: number;
  bankEnabled: boolean;
  lunchDeductMode: string;
  fixedLunchMinutes: number;
  roundingMinutes: number;
};

@Injectable()
export class WorkHoursService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Query otimizada: uma única consulta para todos os registros de ponto do tenant no mês.
   * Usa índice (tenantId, punchedAt) ou (tenantId, employeeId, punchedAt).
   */
  async getMonthTimeEntries(params: {
    tenantId: string;
    year: number;
    month: number;
    employeeId?: string | null;
  }) {
    const startUtc = new Date(Date.UTC(params.year, params.month - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(params.year, params.month, 1, 0, 0, 0, 0));

    const where: any = {
      tenantId: params.tenantId,
      punchedAt: { gte: startUtc, lt: endUtc },
    };
    if (params.employeeId) where.employeeId = params.employeeId;

    return this.prisma.timeEntry.findMany({
      where,
      orderBy: { punchedAt: "asc" },
      select: {
        type: true,
        punchedAt: true,
        employeeId: true,
      },
    });
  }

  async getSettings(tenantId: string): Promise<Settings | null> {
    const s = await this.prisma.tenantSettings.findFirst({
      where: { tenantId },
    });
    if (!s) return null;
    return {
      timezone: s.timezone ?? "America/Sao_Paulo",
      targetMode: (s.targetMode as string) ?? "MONTHLY",
      targetDailyMinutes: s.targetDailyMinutes ?? 480,
      targetMonthlyMinutes: s.targetMonthlyMinutes ?? 13200,
      bankEnabled: s.bankEnabled ?? false,
      lunchDeductMode: (s.lunchDeductMode as string) ?? "BY_PUNCH",
      fixedLunchMinutes: s.fixedLunchMinutes ?? 60,
      roundingMinutes: s.roundingMinutes ?? 0,
    };
  }

  /**
   * Calcula minutos trabalhados em um dia a partir dos batimentos (IN, LUNCH_OUT, LUNCH_IN, OUT).
   */
  computeDayWorkedMinutes(
    punches: PunchRow[],
    settings: Settings,
  ): { workedMinutes: number; flags: string[]; detail: DayDetail; date: string } {
    const timeZone = settings.timezone;
    const date = punches.length ? dayKeyInTz(punches[0].punchedAt, timeZone) : "";

    const firstIn = punches.find((p) => p.type === "IN")?.punchedAt ?? null;
    const lunchOut = punches.find((p) => p.type === "LUNCH_OUT")?.punchedAt ?? null;
    const lunchIn = punches.find((p) => p.type === "LUNCH_IN")?.punchedAt ?? null;
    const lastOut = [...punches].reverse().find((p) => p.type === "OUT")?.punchedAt ?? null;

    const flags: string[] = [];
    if (firstIn && !lastOut) flags.push("MISSING_OUT");
    if (!firstIn && lastOut) flags.push("MISSING_IN");
    if (lunchOut && !lunchIn) flags.push("MISSING_LUNCH_IN");
    if (!lunchOut && lunchIn) flags.push("MISSING_LUNCH_OUT");

    let workedMinutes = 0;
    if (firstIn && lastOut && lastOut.getTime() > firstIn.getTime()) {
      workedMinutes = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60000);
      if (settings.lunchDeductMode === "BY_PUNCH") {
        if (lunchOut && lunchIn && lunchIn.getTime() > lunchOut.getTime()) {
          workedMinutes -= Math.floor((lunchIn.getTime() - lunchOut.getTime()) / 60000);
        } else if (lunchOut || lunchIn) {
          flags.push("LUNCH_INCOMPLETE_NO_DEDUCT");
        }
      } else {
        workedMinutes -= settings.fixedLunchMinutes;
      }
    }
    if (workedMinutes < 0) workedMinutes = 0;
    if (settings.roundingMinutes > 0) {
      workedMinutes = Math.round(workedMinutes / settings.roundingMinutes) * settings.roundingMinutes;
    }

    const detail: DayDetail = {
      date,
      firstIn: firstIn ? firstIn.toISOString() : null,
      lunchOut: lunchOut ? lunchOut.toISOString() : null,
      lunchIn: lunchIn ? lunchIn.toISOString() : null,
      lastOut: lastOut ? lastOut.toISOString() : null,
      workedMinutes,
      workedHHMM: minutesToHHMM(workedMinutes),
      flags,
    };
    return { workedMinutes, flags, detail, date };
  }

  /**
   * Saldo do banco de horas até o mês anterior (soma de extra - débito dos resumos anteriores).
   */
  async getBankBalanceBeforeMonth(params: {
    tenantId: string;
    employeeId: string;
    beforeYearMonth: string;
  }): Promise<number> {
    const rows = await this.prisma.monthlySummary.findMany({
      where: {
        tenantId: params.tenantId,
        employeeId: params.employeeId,
        yearMonth: { lt: params.beforeYearMonth },
      },
      select: { extraMinutes: true, debitMinutes: true },
    });
    return rows.reduce((acc, r) => acc + r.extraMinutes - r.debitMinutes, 0);
  }

  /**
   * Resumo mensal para um funcionário: dias, totais, extras, débito e banco de horas.
   */
  async getMonthlySummaryForEmployee(params: {
    tenantId: string;
    employeeId: string;
    month: string;
  }) {
    const { tenantId, employeeId, month } = params;
    const { ym, year, month: monthNum } = parseYearMonthOrThrow(month);

    const [employee, settings, timeRows] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { id: true, name: true, cpf: true, isActive: true },
      }),
      this.getSettings(tenantId),
      this.getMonthTimeEntries({ tenantId, year, month: monthNum, employeeId }),
    ]);

    if (!employee) throw new NotFoundException("Funcionário não encontrado");
    if (!employee.isActive) throw new BadRequestException("Funcionário inativo");

    const sett = settings ?? {
      timezone: "America/Sao_Paulo",
      targetMode: "MONTHLY",
      targetDailyMinutes: 480,
      targetMonthlyMinutes: 13200,
      bankEnabled: false,
      lunchDeductMode: "BY_PUNCH",
      fixedLunchMinutes: 60,
      roundingMinutes: 0,
    };

    const byDay = new Map<string, PunchRow[]>();
    for (const r of timeRows) {
      const key = dayKeyInTz(r.punchedAt, sett.timezone);
      const arr = byDay.get(key) || [];
      arr.push({ type: r.type, punchedAt: r.punchedAt });
      byDay.set(key, arr);
    }

    const startUtc = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
    let daysExpected = 0;
    if (sett.targetMode === "DAILY") {
      for (let d = new Date(startUtc.getTime()); d.getTime() < endUtc.getTime(); ) {
        if (!isWeekendInTz(d, sett.timezone)) daysExpected++;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const days: DayDetail[] = [];
    let inconsistenciesCount = 0;

    for (const [date, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const { detail, flags } = this.computeDayWorkedMinutes(list, sett);
      days.push(detail);
      if (flags.length > 0) inconsistenciesCount += 1;
    }

    const workedTotal = days.reduce((acc, d) => acc + d.workedMinutes, 0);
    const targetMinutes =
      sett.targetMode === "MONTHLY" ? sett.targetMonthlyMinutes : sett.targetDailyMinutes * daysExpected;
    const delta = workedTotal - targetMinutes;
    const extraMinutes = delta > 0 ? delta : 0;
    const debitMinutes = delta < 0 ? Math.abs(delta) : 0;

    let bankBalanceBefore = 0;
    let bankBalanceAfter = 0;
    if (sett.bankEnabled) {
      bankBalanceBefore = await this.getBankBalanceBeforeMonth({
        tenantId,
        employeeId,
        beforeYearMonth: ym,
      });
      bankBalanceAfter = bankBalanceBefore + (extraMinutes - debitMinutes);
    }

    return {
      employee: { id: employee.id, name: employee.name, cpf: employee.cpf },
      month: ym,
      settings: {
        timezone: sett.timezone,
        targetMode: sett.targetMode,
        targetDailyMinutes: sett.targetDailyMinutes,
        targetMonthlyMinutes: sett.targetMonthlyMinutes,
        bankEnabled: sett.bankEnabled,
      },
      totals: {
        targetMinutes,
        targetHHMM: minutesToHHMM(targetMinutes),
        workedMinutes: workedTotal,
        workedHHMM: minutesToHHMM(workedTotal),
        extraMinutes,
        extraHHMM: minutesToHHMM(extraMinutes),
        debitMinutes,
        debitHHMM: minutesToHHMM(debitMinutes),
        daysWorked: days.filter((d) => d.workedMinutes > 0).length,
        daysExpected: sett.targetMode === "DAILY" ? daysExpected : null,
        inconsistenciesCount,
      },
      bankOfHours: sett.bankEnabled
        ? {
            balanceBeforeMinutes: bankBalanceBefore,
            balanceBeforeHHMM: minutesToHHMM(bankBalanceBefore),
            balanceAfterMinutes: bankBalanceAfter,
            balanceAfterHHMM: minutesToHHMM(bankBalanceAfter),
          }
        : null,
      days,
    };
  }

  /**
   * Resumo mensal para o tenant: um ou todos os funcionários.
   * Query otimizada: uma busca de registros no mês + uma de saldos anteriores (quando banco habilitado).
   */
  async getMonthlySummaries(params: {
    tenantId: string;
    month: string;
    employeeId?: string | null;
  }) {
    const { tenantId, month, employeeId } = params;
    const { ym, year, month: monthNum } = parseYearMonthOrThrow(month);

    const settings = await this.getSettings(tenantId);
    const sett = settings ?? {
      timezone: "America/Sao_Paulo",
      targetMode: "MONTHLY",
      targetDailyMinutes: 480,
      targetMonthlyMinutes: 13200,
      bankEnabled: false,
      lunchDeductMode: "BY_PUNCH",
      fixedLunchMinutes: 60,
      roundingMinutes: 0,
    };

    const timeRows = await this.getMonthTimeEntries({
      tenantId,
      year,
      month: monthNum,
      employeeId: employeeId ?? undefined,
    });

    if (timeRows.length === 0 && employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { id: true, name: true, cpf: true },
      });
      if (!employee) throw new NotFoundException("Funcionário não encontrado");
      const startUtc = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
      const endUtc = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
      let daysExpected = 0;
      if (sett.targetMode === "DAILY") {
        for (let d = new Date(startUtc.getTime()); d.getTime() < endUtc.getTime(); ) {
          if (!isWeekendInTz(d, sett.timezone)) daysExpected++;
          d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
        }
      }
      const targetMinutes =
        sett.targetMode === "MONTHLY" ? sett.targetMonthlyMinutes : sett.targetDailyMinutes * daysExpected;
      let bankBefore = 0;
      if (sett.bankEnabled) {
        bankBefore = await this.getBankBalanceBeforeMonth({
          tenantId,
          employeeId,
          beforeYearMonth: ym,
        });
      }
      return {
        month: ym,
        summaries: [
          {
            employee: { id: employee.id, name: employee.name, cpf: employee.cpf },
            totals: {
              targetMinutes,
              workedMinutes: 0,
              extraMinutes: 0,
              debitMinutes: targetMinutes,
              daysWorked: 0,
              inconsistenciesCount: 0,
            },
            bankOfHours: sett.bankEnabled
              ? { balanceBeforeMinutes: bankBefore, balanceAfterMinutes: bankBefore - targetMinutes }
              : null,
          },
        ],
      };
    }

    const byEmployee = new Map<string, PunchRow[]>();
    for (const r of timeRows) {
      const eid = r.employeeId!;
      const arr = byEmployee.get(eid) || [];
      arr.push({ type: r.type, punchedAt: r.punchedAt });
      byEmployee.set(eid, arr);
    }

    const employeeIds = [...byEmployee.keys()];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, tenantId },
      select: { id: true, name: true, cpf: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    let bankBalances: Map<string, number> = new Map();
    if (sett.bankEnabled && employeeIds.length > 0) {
      const previous = await this.prisma.monthlySummary.findMany({
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          yearMonth: { lt: ym },
        },
        select: { employeeId: true, extraMinutes: true, debitMinutes: true },
      });
      for (const row of previous) {
        const cur = bankBalances.get(row.employeeId) ?? 0;
        bankBalances.set(row.employeeId, cur + row.extraMinutes - row.debitMinutes);
      }
    }

    const startUtc = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
    let daysExpected = 0;
    if (sett.targetMode === "DAILY") {
      for (let d = new Date(startUtc.getTime()); d.getTime() < endUtc.getTime(); ) {
        if (!isWeekendInTz(d, sett.timezone)) daysExpected++;
        d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const summaries: any[] = [];

    for (const eid of employeeIds) {
      const punches = byEmployee.get(eid) || [];
      const emp = empMap.get(eid);
      if (!emp) continue;

      const byDay = new Map<string, PunchRow[]>();
      for (const p of punches) {
        const key = dayKeyInTz(p.punchedAt, sett.timezone);
        const arr = byDay.get(key) || [];
        arr.push(p);
        byDay.set(key, arr);
      }

      const days: DayDetail[] = [];
      let inconsistenciesCount = 0;
      for (const [, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const { detail, flags } = this.computeDayWorkedMinutes(list, sett);
        days.push(detail);
        if (flags.length > 0) inconsistenciesCount += 1;
      }

      const workedTotal = days.reduce((acc, d) => acc + d.workedMinutes, 0);
      const targetMinutes =
        sett.targetMode === "MONTHLY" ? sett.targetMonthlyMinutes : sett.targetDailyMinutes * daysExpected;
      const delta = workedTotal - targetMinutes;
      const extraMinutes = delta > 0 ? delta : 0;
      const debitMinutes = delta < 0 ? Math.abs(delta) : 0;

      const bankBefore = sett.bankEnabled ? bankBalances.get(eid) ?? 0 : 0;
      const bankAfter = sett.bankEnabled ? bankBefore + (extraMinutes - debitMinutes) : 0;

      summaries.push({
        employee: { id: emp.id, name: emp.name, cpf: emp.cpf },
        totals: {
          targetMinutes,
          targetHHMM: minutesToHHMM(targetMinutes),
          workedMinutes: workedTotal,
          workedHHMM: minutesToHHMM(workedTotal),
          extraMinutes,
          extraHHMM: minutesToHHMM(extraMinutes),
          debitMinutes,
          debitHHMM: minutesToHHMM(debitMinutes),
          daysWorked: days.filter((d) => d.workedMinutes > 0).length,
          daysExpected: sett.targetMode === "DAILY" ? daysExpected : null,
          inconsistenciesCount,
        },
        bankOfHours: sett.bankEnabled
          ? {
              balanceBeforeMinutes: bankBefore,
              balanceBeforeHHMM: minutesToHHMM(bankBefore),
              balanceAfterMinutes: bankAfter,
              balanceAfterHHMM: minutesToHHMM(bankAfter),
            }
          : null,
        days,
      });
    }

    return {
      month: ym,
      settings: {
        timezone: sett.timezone,
        targetMode: sett.targetMode,
        bankEnabled: sett.bankEnabled,
      },
      summaries,
    };
  }
}
