import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
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

  @Post("monthly-summary/close-month")
  closeMonth(@Req() req: any, @Body() body: { yearMonth: string }) {
    return this.monthly.closeMonth({
      tenantId: this.tenantId(req),
      yearMonth: body?.yearMonth ?? "",
    });
  }

  @Post("monthly-summary/reopen-month")
  @UseGuards(RolesGuard)
  @Roles("TENANT_ADMIN")
  reopenMonth(@Req() req: any, @Body() body: { yearMonth: string }) {
    return this.monthly.reopenMonth({
      tenantId: this.tenantId(req),
      yearMonth: body?.yearMonth ?? "",
    });
  }

  @Get("monthly-summary/pdf")
  async getMonthlySummaryPdf(
    @Req() req: any,
    @Query("month") month: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.monthly.getMonthlySummaryPdfBuffer(this.tenantId(req), month ?? "");
    const filename = `smartponto-${(month ?? "").trim()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  }
}