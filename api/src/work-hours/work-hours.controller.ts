import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkHoursService } from "./work-hours.service";

@UseGuards(JwtAuthGuard)
@Controller("work-hours")
export class WorkHoursController {
  constructor(private readonly workHours: WorkHoursService) {}

  private tenantId(req: any): string {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  /**
   * Resumo mensal de jornada.
   * - Com employeeId: resumo detalhado do funcionário (dias, totais, extras, banco de horas).
   * - Sem employeeId: resumos de todos os funcionários com ponto no mês (query otimizada).
   * GET /work-hours/monthly?month=YYYY-MM
   * GET /work-hours/monthly?month=YYYY-MM&employeeId=xxx
   */
  @Get("monthly")
  getMonthly(
    @Req() req: any,
    @Query("month") month: string,
    @Query("employeeId") employeeId?: string,
  ) {
    const tenantId = this.tenantId(req);
    if (employeeId) {
      return this.workHours.getMonthlySummaryForEmployee({
        tenantId,
        employeeId,
        month,
      });
    }
    return this.workHours.getMonthlySummaries({
      tenantId,
      month,
      employeeId: null,
    });
  }

}
