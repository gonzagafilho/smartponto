import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MonthlyService } from "./monthly.service";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class MonthlyController {
  constructor(private readonly monthly: MonthlyService) {}

  private tenantId(req: any) {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  @Get("monthly-summary")
  monthlySummary(
    @Req() req: any,
    @Query("employeeId") employeeId: string,
    @Query("month") month: string,
  ) {
    return this.monthly.monthlySummary({
      tenantId: this.tenantId(req),
      employeeId,
      month,
    });
  }
    @Post("monthly-summary/close")
  closeMonthlySummary(
    @Req() req: any,
    @Body() body: { employeeId: string; month: string },
  ) {
    return this.monthly.closeMonthlySummary({
      tenantId: this.tenantId(req),
      employeeId: body?.employeeId,
      month: body?.month,
    });
  }
}