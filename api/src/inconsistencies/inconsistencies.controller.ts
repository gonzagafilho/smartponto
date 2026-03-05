import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { InconsistenciesService } from "./inconsistencies.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inconsistencies")
export class InconsistenciesController {
  constructor(private readonly inconsistencies: InconsistenciesService) {}

  private tenantId(req: any): string {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  /**
   * GET /api/inconsistencies?month=YYYY-MM
   * Alertas de inconsistência do mês: IN sem OUT, OUT sem IN, duplicidade,
   * intervalo fora do padrão, jornada acima de X horas.
   * Admin lista "top inconsistências" (resumo por tipo + lista ordenada).
   */
  @Get()
  @Roles("TENANT_ADMIN", "TENANT_MANAGER")
  getInconsistencies(@Req() req: any, @Query("month") month: string) {
    return this.inconsistencies.getInconsistencies(this.tenantId(req), month ?? "");
  }
}
