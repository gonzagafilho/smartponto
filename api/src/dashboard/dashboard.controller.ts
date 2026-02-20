// src/dashboard/dashboard.controller.ts
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get("metrics")
  async metrics(@Req() req: any) {
    // Esperado: req.user contém companyId (multi-tenant)
    return this.dashboardService.getMetrics(req.user);
  }
}
