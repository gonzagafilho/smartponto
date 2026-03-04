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
      const [tenantsActive, employeesActive, timeEntriesToday, subsAgg] = await Promise.all([
        this.prisma.tenant.count({ where: { isActive: true } }),
        this.prisma.employee.count({ where: { isActive: true } }),
        this.prisma.timeEntry.count({ where: { punchedAt: { gte: dayStart, lte: dayEnd } } }),
        this.prisma.subscription.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: { tenant: { isActive: true } },
        }),
      ]);

      const tenantsPaying = subsAgg.find((x) => x.status === "ACTIVE")?._count._all ?? 0;
      const tenantsTrial = subsAgg.find((x) => x.status === "TRIAL")?._count._all ?? 0;
      const tenantsPastDue = subsAgg.find((x) => x.status === "PAST_DUE")?._count._all ?? 0;

      const activeSubs = await this.prisma.subscription.findMany({
        where: { status: "ACTIVE", tenant: { isActive: true }, plan: { isActive: true } },
        select: { plan: { select: { priceCents: true } } },
      });

      const mrrRealCents = activeSubs.reduce((sum, s) => sum + (s.plan?.priceCents ?? 0), 0);

      return {
        tenantsActive,
        employeesActive,
        timeEntriesToday,
        tenantsPaying,
        tenantsTrial,
        tenantsPastDue,
        mrrRealCents,
      };
    }

    // ✅ se esse endpoint for usado por tenant (opcional)
    if (!tenantId) {
      return {
        employeesActive: 0,
        timeEntriesToday: 0,
        punchesMonth: 0,
        revenueMonthlyEstimated: 0,
        _warn: "tenantId não encontrado no token.",
      };
    }

    const tid = tenantId;

    const [employeesActive, timeEntriesToday, punchesMonth] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId: tid, isActive: true } }),
      this.prisma.timeEntry.count({ where: { tenantId: tid, punchedAt: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.timeEntry.count({ where: { tenantId: tid, punchedAt: { gte: monthStart, lt: nextMonthStart } } }),
    ]);

    return {
      employeesActive,
      timeEntriesToday,
      punchesMonth,
      revenueMonthlyEstimated: 0,
    };
  }
}