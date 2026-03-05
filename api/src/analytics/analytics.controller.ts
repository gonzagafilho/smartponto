import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { AnalyticsService } from "./analytics.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analytics")
@Roles("TENANT_ADMIN", "TENANT_MANAGER")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  private tenantId(req: any): string {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  /**
   * GET /api/analytics/overtime?month=YYYY-MM
   * Agregado para dashboard Admin: totais, top 10 extras, dados para gráfico.
   * Fonte: MonthlySummary do tenant no mês.
   */
  @Get("overtime")
  getOvertime(@Req() req: any, @Query("month") month: string) {
    return this.analytics.getOvertime(this.tenantId(req), month ?? "");
  }
}
