import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type PunchRow = {
  id: string;
  type: string;
  punchedAt: Date;
  selfieUrl: string | null;
  isOffline: boolean;
  deviceId: string | null;
  distanceM: number | null;
};

function parseYmdOrThrow(v: string, field: string): string {
  const s = (v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new BadRequestException(`${field} inválido. Use YYYY-MM-DD`);
  }
  return s;
}

function toUtcStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function toUtcEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function dayKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseYearMonthOrThrow(v: string): string {
  const s = (v || "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) throw new BadRequestException("month inválido. Use YYYY-MM");
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException("month inválido. Use YYYY-MM");
  }
  return s;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inconsistências do mês a partir de MonthlySummary (não altera TimeEntry nem punch).
   * Lista por funcionário: inconsistenciesCount + detalhes extraídos do detailsJson.
   */
  async getInconsistencies(tenantId: string, month: string) {
    const ym = parseYearMonthOrThrow(month);

    const summaries = await this.prisma.monthlySummary.findMany({
      where: { tenantId, yearMonth: ym },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { employee: { name: "asc" } },
    });

    const byEmployee: Array<{
      employeeId: string;
      employeeName: string;
      inconsistenciesCount: number;
      details: Array<{ date: string; flags: string[] }> | null;
    }> = [];

    let totalInconsistencies = 0;

    for (const s of summaries) {
      let details: Array<{ date: string; flags: string[] }> | null = null;
      const json = s.detailsJson as { days?: Array<{ date: string; flags?: string[] }> } | null;
      if (json?.days && Array.isArray(json.days)) {
        details = json.days
          .filter((d) => d.flags && d.flags.length > 0)
          .map((d) => ({ date: d.date, flags: d.flags ?? [] }));
      }

      byEmployee.push({
        employeeId: s.employeeId,
        employeeName: s.employee.name,
        inconsistenciesCount: s.inconsistenciesCount,
        details,
      });
      totalInconsistencies += s.inconsistenciesCount;
    }

    const totalEmployeesWithInconsistencies = byEmployee.filter((e) => e.inconsistenciesCount > 0).length;

    return {
      month: ym,
      totals: {
        totalInconsistencies,
        totalEmployeesWithInconsistencies,
      },
      byEmployee,
    };
  }

  async timesheet(params: { tenantId: string; employeeId: string; from: string; to: string }) {
    const tenantId = params.tenantId;
    const employeeId = (params.employeeId || "").trim();
    if (!employeeId) throw new BadRequestException("employeeId é obrigatório");

    const from = parseYmdOrThrow(params.from, "from");
    const to = parseYmdOrThrow(params.to, "to");

    const fromAt = toUtcStart(from);
    const toAt = toUtcEnd(to);

    if (fromAt.getTime() > toAt.getTime()) {
      throw new BadRequestException("from não pode ser maior que to");
    }

    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, name: true, cpf: true, tenantId: true, isActive: true },
    });

    if (!emp) throw new NotFoundException("Funcionário não encontrado");
    if (!emp.isActive) throw new BadRequestException("Funcionário inativo");

    const rows: PunchRow[] = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        employeeId,
        punchedAt: { gte: fromAt, lte: toAt },
      },
      orderBy: { punchedAt: "asc" },
      select: {
        id: true,
        type: true,
        punchedAt: true,
        selfieUrl: true,
        isOffline: true,
        deviceId: true,
        distanceM: true,
      },
    });

    const byDay = new Map<string, PunchRow[]>();
    for (const r of rows) {
      const k = dayKeyUTC(r.punchedAt);
      const arr = byDay.get(k) || [];
      arr.push(r);
      byDay.set(k, arr);
    }

    const START = new Set(["IN", "LUNCH_IN"]);
    const END = new Set(["OUT", "LUNCH_OUT"]);

    const days: Array<{
      date: string;
      punches: Array<{ type: string; punchedAt: string; selfieUrl: string | null; isOffline: boolean }>;
      workedMinutes: number;
      workedHHMM: string;
    }> = [];

    for (
      let d = new Date(fromAt.getTime());
      d.getTime() <= toAt.getTime();
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const key = dayKeyUTC(d);
      const list = byDay.get(key) || [];

      const punches = list.map((p) => ({
        type: p.type,
        punchedAt: p.punchedAt.toISOString(),
        selfieUrl: p.selfieUrl,
        isOffline: !!p.isOffline,
      }));

      let workedMinutes = 0;
      let open: Date | null = null;

      for (const p of list) {
        if (START.has(p.type)) {
          if (!open) open = p.punchedAt;
          continue;
        }
        if (END.has(p.type)) {
          if (open) {
            const diffMs = p.punchedAt.getTime() - open.getTime();
            if (diffMs > 0) workedMinutes += Math.floor(diffMs / 60000);
            open = null;
          }
        }
      }

      days.push({
        date: key,
        punches,
        workedMinutes,
        workedHHMM: minutesToHHMM(workedMinutes),
      });
    }

    const totalMinutes = days.reduce((acc, d) => acc + d.workedMinutes, 0);

    return {
      ok: true,
      employee: emp,
      range: { from, to, fromAt: fromAt.toISOString(), toAt: toAt.toISOString() },
      totals: { workedMinutes: totalMinutes, workedHHMM: minutesToHHMM(totalMinutes) },
      days,
    };
  }
}
