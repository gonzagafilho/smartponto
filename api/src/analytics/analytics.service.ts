import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/analytics/overtime?month=YYYY-MM
   * Fonte: MonthlySummary do tenant no mês.
   * Retorna totais, top 10 por extra, e dados para gráfico (semanal se houver base; por employee).
   */
  async getOvertime(tenantId: string, month: string) {
    const ym = parseYearMonthOrThrow(month);

    const summaries = await this.prisma.monthlySummary.findMany({
      where: { tenantId, yearMonth: ym },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { extraMinutes: "desc" },
    });

    const totals = {
      extraMinutes: summaries.reduce((a, s) => a + s.extraMinutes, 0),
      debitMinutes: summaries.reduce((a, s) => a + s.debitMinutes, 0),
      workedMinutes: summaries.reduce((a, s) => a + s.workedMinutes, 0),
    };

    const topEmployeesByExtra = summaries
      .slice(0, 10)
      .map((s) => ({
        employeeId: s.employeeId,
        employeeName: s.employee.name,
        extraMinutes: s.extraMinutes,
        workedMinutes: s.workedMinutes,
        debitMinutes: s.debitMinutes,
      }));

    // MonthlySummary não tem dados por semana; retornamos gráfico por employee.
    const chartByEmployee = summaries.map((s) => ({
      employeeId: s.employeeId,
      employeeName: s.employee.name,
      extraMinutes: s.extraMinutes,
      debitMinutes: s.debitMinutes,
      workedMinutes: s.workedMinutes,
    }));

    // Sem base semanal no MonthlySummary; array vazio. UI pode usar chartByEmployee.
    const chartWeekly: Array<{ weekLabel: string; extraMinutes: number; debitMinutes: number }> = [];

    return {
      month: ym,
      totals,
      topEmployeesByExtra,
      chartWeekly,
      chartByEmployee,
    };
  }
}
