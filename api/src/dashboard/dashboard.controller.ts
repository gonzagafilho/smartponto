import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { AdminJwtGuard } from "../admin/guards/admin-jwt.guard";

@Controller("dashboard")
@UseGuards(AdminJwtGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("metrics")
  getMetrics(@Req() req: any) {
    // SUPER_ADMIN (AdminJwtGuard injeta req.user)
    return this.dashboardService.getMetrics(req.user);
  }
}
