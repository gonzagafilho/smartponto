import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Códigos de inconsistência para o admin (top inconsistências). */
export const INCONSISTENCY_CODES = {
  IN_SEM_OUT: "IN_SEM_OUT",
  OUT_SEM_IN: "OUT_SEM_IN",
  DUPLICIDADE: "DUPLICIDADE",
  INTERVALO_FORA_PADRAO: "INTERVALO_FORA_PADRAO",
  JORNADA_ACIMA_X_HORAS: "JORNADA_ACIMA_X_HORAS",
} as const;

export type InconsistencyCode = (typeof INCONSISTENCY_CODES)[keyof typeof INCONSISTENCY_CODES];

/** Limites padrão (podem vir de TenantSettings no futuro). */
const MAX_DAY_MINUTES = 600; // 10h - jornada acima de X horas
const LUNCH_MIN_MINUTES = 30;
const LUNCH_MAX_MINUTES = 120; // 2h
const DUP_WINDOW_SEC = 120; // duplicidade: mesmo tipo em menos de 120s
const MAX_SPAN_MINUTES = 14 * 60; // 14h primeiro IN ao último OUT = intervalo fora

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

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type PunchRow = { type: string; punchedAt: Date; employeeId: string };

export type InconsistencyItem = {
  code: InconsistencyCode;
  label: string;
  employeeId: string;
  employeeName: string;
  date: string;
  message: string;
};

@Injectable()
export class InconsistenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string): Promise<{ timezone: string }> {
    const s = await this.prisma.tenantSettings.findFirst({
      where: { tenantId },
    });
    return {
      timezone: s?.timezone ?? "America/Sao_Paulo",
    };
  }

  /**
   * GET /api/inconsistencies?month=YYYY-MM
   * Detecta: IN sem OUT, OUT sem IN, duplicidade, intervalo fora do padrão, jornada acima de X horas.
   * Retorna resumo por tipo e lista (top) de inconsistências para o admin.
   */
  async getInconsistencies(tenantId: string, month: string) {
    const { ym, year, month: monthNum } = parseYearMonthOrThrow(month);
    const settings = await this.getSettings(tenantId);
    const timeZone = settings.timezone;

    const startUtc = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));

    const rows = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        punchedAt: { gte: startUtc, lt: endUtc },
      },
      orderBy: { punchedAt: "asc" },
      select: {
        type: true,
        punchedAt: true,
        employeeId: true,
      },
    });

    const byEmployeeDay = new Map<string, PunchRow[]>();
    for (const r of rows) {
      const key = `${r.employeeId}|${dayKeyInTz(r.punchedAt, timeZone)}`;
      const arr = byEmployeeDay.get(key) || [];
      arr.push({ type: r.type, punchedAt: r.punchedAt, employeeId: r.employeeId });
      byEmployeeDay.set(key, arr);
    }

    const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
    const employees =
      employeeIds.length > 0
        ? await this.prisma.employee.findMany({
            where: { id: { in: employeeIds }, tenantId },
            select: { id: true, name: true },
          })
        : [];
    const empMap = new Map(employees.map((e) => [e.id, e.name]));

    const items: InconsistencyItem[] = [];
    const summary: Record<string, number> = {
      [INCONSISTENCY_CODES.IN_SEM_OUT]: 0,
      [INCONSISTENCY_CODES.OUT_SEM_IN]: 0,
      [INCONSISTENCY_CODES.DUPLICIDADE]: 0,
      [INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO]: 0,
      [INCONSISTENCY_CODES.JORNADA_ACIMA_X_HORAS]: 0,
    };

    const labels: Record<string, string> = {
      [INCONSISTENCY_CODES.IN_SEM_OUT]: "IN sem OUT",
      [INCONSISTENCY_CODES.OUT_SEM_IN]: "OUT sem IN",
      [INCONSISTENCY_CODES.DUPLICIDADE]: "Duplicidade",
      [INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO]: "Intervalo fora do padrão",
      [INCONSISTENCY_CODES.JORNADA_ACIMA_X_HORAS]: "Jornada acima de 10h",
    };

    for (const [key, list] of byEmployeeDay.entries()) {
      const [employeeId, date] = key.split("|");
      const name = empMap.get(employeeId) ?? "—";

      const firstIn = list.find((p) => p.type === "IN")?.punchedAt ?? null;
      const lastOut = [...list].reverse().find((p) => p.type === "OUT")?.punchedAt ?? null;
      const lunchOut = list.find((p) => p.type === "LUNCH_OUT")?.punchedAt ?? null;
      const lunchIn = list.find((p) => p.type === "LUNCH_IN")?.punchedAt ?? null;

      // 1) IN sem OUT
      if (firstIn && !lastOut) {
        items.push({
          code: INCONSISTENCY_CODES.IN_SEM_OUT,
          label: labels[INCONSISTENCY_CODES.IN_SEM_OUT],
          employeeId,
          employeeName: name,
          date,
          message: "Entrada registrada sem saída no mesmo dia.",
        });
        summary[INCONSISTENCY_CODES.IN_SEM_OUT]++;
      }

      // 2) OUT sem IN
      if (!firstIn && lastOut) {
        items.push({
          code: INCONSISTENCY_CODES.OUT_SEM_IN,
          label: labels[INCONSISTENCY_CODES.OUT_SEM_IN],
          employeeId,
          employeeName: name,
          date,
          message: "Saída registrada sem entrada no mesmo dia.",
        });
        summary[INCONSISTENCY_CODES.OUT_SEM_IN]++;
      }

      // 3) Duplicidade: mesmo tipo mais de uma vez no dia, ou dois do mesmo tipo em menos de DUP_WINDOW_SEC
      const typeCounts: Record<string, number> = {};
      for (const p of list) {
        typeCounts[p.type] = (typeCounts[p.type] ?? 0) + 1;
      }
      const hasDuplicateCount = Object.values(typeCounts).some((c) => c > 1);
      let hasDuplicateWindow = false;
      for (let i = 1; i < list.length; i++) {
        if (list[i].type === list[i - 1].type) {
          const sec = (list[i].punchedAt.getTime() - list[i - 1].punchedAt.getTime()) / 1000;
          if (sec < DUP_WINDOW_SEC) {
            hasDuplicateWindow = true;
            break;
          }
        }
      }
      if (hasDuplicateCount || hasDuplicateWindow) {
        items.push({
          code: INCONSISTENCY_CODES.DUPLICIDADE,
          label: labels[INCONSISTENCY_CODES.DUPLICIDADE],
          employeeId,
          employeeName: name,
          date,
          message: hasDuplicateWindow
            ? "Batidas do mesmo tipo em intervalo menor que 2 minutos."
            : "Mais de uma batida do mesmo tipo no dia.",
        });
        summary[INCONSISTENCY_CODES.DUPLICIDADE]++;
      }

      // 4) Intervalo fora do padrão: almoço < 30min ou > 2h; ou span do dia > 14h
      if (lunchOut && lunchIn) {
        const lunchMin = Math.floor((lunchIn.getTime() - lunchOut.getTime()) / 60000);
        if (lunchMin < LUNCH_MIN_MINUTES || lunchMin > LUNCH_MAX_MINUTES) {
          items.push({
            code: INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO,
            label: labels[INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO],
            employeeId,
            employeeName: name,
            date,
            message: `Intervalo de almoço ${minutesToHHMM(lunchMin)} (esperado entre ${LUNCH_MIN_MINUTES}min e ${LUNCH_MAX_MINUTES}min).`,
          });
          summary[INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO]++;
        }
      }
      if (firstIn && lastOut) {
        const spanMin = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60000);
        if (spanMin > MAX_SPAN_MINUTES) {
          items.push({
            code: INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO,
            label: labels[INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO],
            employeeId,
            employeeName: name,
            date,
            message: `Período no local (entrada–saída) de ${minutesToHHMM(spanMin)} (acima de 14h).`,
          });
          summary[INCONSISTENCY_CODES.INTERVALO_FORA_PADRAO]++;
        }
      }

      // 5) Jornada acima de X horas (trabalhado efetivo)
      let workedMinutes = 0;
      if (firstIn && lastOut && lastOut.getTime() > firstIn.getTime()) {
        workedMinutes = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60000);
        if (lunchOut && lunchIn && lunchIn.getTime() > lunchOut.getTime()) {
          workedMinutes -= Math.floor((lunchIn.getTime() - lunchOut.getTime()) / 60000);
        }
      }
      if (workedMinutes > MAX_DAY_MINUTES) {
        items.push({
          code: INCONSISTENCY_CODES.JORNADA_ACIMA_X_HORAS,
          label: labels[INCONSISTENCY_CODES.JORNADA_ACIMA_X_HORAS],
          employeeId,
          employeeName: name,
          date,
          message: `Jornada de ${minutesToHHMM(workedMinutes)} (limite ${MAX_DAY_MINUTES / 60}h).`,
        });
        summary[INCONSISTENCY_CODES.JORNADA_ACIMA_X_HORAS]++;
      }
    }

    // Top: ordenar por tipo (mais frequentes primeiro) e depois os itens por (code, date, employeeName)
    const byCode = Object.entries(summary)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    const top = byCode.flatMap(([code]) =>
      items.filter((i) => i.code === code).sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName)),
    );

    return {
      month: ym,
      summary: {
        total: items.length,
        byType: summary,
      },
      topInconsistencies: top,
      items,
    };
  }
}
