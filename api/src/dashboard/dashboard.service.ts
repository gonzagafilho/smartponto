// src/dashboard/dashboard.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private getCompanyId(user: any): string | null {
    return (
      user?.companyId ||
      user?.company_id ||
      user?.company?.id ||
      user?.tenantId ||
      null
    );
  }

  private startOfLocalDay(d = new Date()) {
    // Depende do TZ do servidor. Recomendo: TZ=America/Sao_Paulo no PM2 (falo abaixo).
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfLocalDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  private startOfLocalMonth(d = new Date()) {
    const x = new Date(d);
    x.setDate(1);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  async getMetrics(user: any) {
    const companyId = this.getCompanyId(user);
    if (!companyId) {
      // Se isso acontecer, seu token não está carregando companyId ainda
      return {
        employeesActive: 0,
        punchesToday: 0,
        hoursMonth: 0,
        lateOrAbsences: 0,
        _warn: "companyId não encontrado no token (req.user).",
      };
    }

    const prismaAny = this.prisma as any;

    // ===== 1) Funcionários ativos =====
    let employeesActive = 0;
    try {
      // tenta: employee.isActive = true
      employeesActive = await prismaAny.employee.count({
        where: { companyId, isActive: true },
      });
    } catch (e1) {
      try {
        // tenta: employee.active = true
        employeesActive = await prismaAny.employee.count({
          where: { companyId, active: true },
        });
      } catch (e2) {
        try {
          // tenta: employee.status = "ACTIVE"
          employeesActive = await prismaAny.employee.count({
            where: { companyId, status: "ACTIVE" },
          });
        } catch (e3) {
          // fallback: conta todos da empresa
          employeesActive = await prismaAny.employee.count({ where: { companyId } });
        }
      }
    }

    // ===== 2) Pontos hoje (time entries) =====
    const from = this.startOfLocalDay(new Date());
    const to = this.endOfLocalDay(new Date());

    let punchesToday = 0;
    // vamos tentar alguns nomes comuns de campo de data
    const dateFields = ["createdAt", "at", "occurredAt", "timestamp", "registeredAt"];

    for (const field of dateFields) {
      try {
        punchesToday = await prismaAny.timeEntry.count({
          where: {
            companyId,
            [field]: { gte: from, lte: to },
          },
        });
        break; // se deu certo, sai
      } catch {
        // tenta próximo field
      }
    }

    // ===== 3) Horas do mês (melhor esforço) =====
    // Se você já tiver um campo pronto tipo workedMinutes/durationMinutes/etc, soma.
    const monthFrom = this.startOfLocalMonth(new Date());
    let hoursMonth = 0;

    // tenta somar em campos comuns
    const sumFields = ["workedMinutes", "durationMinutes", "workedSeconds", "durationSeconds"];

    let summed = false;
    for (const sf of sumFields) {
      try {
        const r = await prismaAny.timeEntry.aggregate({
          where: {
            companyId,
            createdAt: { gte: monthFrom },
          },
          _sum: { [sf]: true },
        });
        const v = r?._sum?.[sf];
        if (typeof v === "number" && !Number.isNaN(v)) {
          // minutes -> hours / seconds -> hours
          hoursMonth =
            sf.toLowerCase().includes("second") ? v / 3600 : v / 60;
          summed = true;
          break;
        }
      } catch {
        // tenta o próximo
      }
    }

    if (!summed) {
      // fallback simples: deixa 0 até a gente plugar cálculo correto (timesheet)
      hoursMonth = 0;
    }

    // ===== 4) Atrasos/Faltas (v1 simples) =====
    // Sem o motor CLT ainda, retornamos 0 por enquanto.
    // Depois a gente calcula isso pelo timesheet/regras.
    const lateOrAbsences = 0;

    return {
      employeesActive,
      punchesToday,
      hoursMonth: Math.round(hoursMonth * 10) / 10,
      lateOrAbsences,
      range: { todayFrom: from.toISOString(), todayTo: to.toISOString() },
    };
  }
}
