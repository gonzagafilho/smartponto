import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}
function endOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}
function startOfNextMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(user: any) {
    const role = user?.role ?? null;
    const tenantId: string | null = user?.tenantId ?? null;

    const now = new Date();
    const dayStart = startOfDayUTC(now);
    const dayEnd = endOfDayUTC(now);
    const monthStart = startOfMonthUTC(now);
    const nextMonthStart = startOfNextMonthUTC(now);

    // ✅ ADMIN GLOBAL (SUPER_ADMIN) → métricas globais
    if (role === "SUPER_ADMIN") {
      const [tenantsActive, employeesActive, timeEntriesToday] = await Promise.all([
        this.prisma.tenant.count({ where: { isActive: true } }),
        this.prisma.employee.count({ where: { isActive: true } }),
        this.prisma.timeEntry.count({ where: { punchedAt: { gte: dayStart, lte: dayEnd } } }),
      ]);

      return {
        tenantsActive,
        employeesActive,
        timeEntriesToday,
        revenueMonthlyEstimated: 0,
      };
    }

    // ✅ (opcional) Se um dia esse endpoint servir pra tenant
    if (!tenantId) {
      return {
        tenantsActive: 0,
        employeesActive: 0,
        timeEntriesToday: 0,
        revenueMonthlyEstimated: 0,
        _warn: "tenantId não encontrado no token.",
      };
    }

    const [employeesActive, timeEntriesToday, punchesMonth] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, isActive: true } }),
      this.prisma.timeEntry.count({ where: { tenantId, punchedAt: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.timeEntry.count({ where: { tenantId, punchedAt: { gte: monthStart, lt: nextMonthStart } } }),
    ]);

    return {
      employeesActive,
      timeEntriesToday,
      punchesMonth,
      revenueMonthlyEstimated: 0,
    };
  }
}
