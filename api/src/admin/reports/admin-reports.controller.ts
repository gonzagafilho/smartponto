import { BadRequestException, Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AdminJwtGuard } from "../guards/admin-jwt.guard";
import { MonthlyService } from "../../reports/monthly.service";

@UseGuards(AdminJwtGuard)
@Controller("admin/reports")
export class AdminReportsController {
  constructor(private readonly monthly: MonthlyService) {}

  /**
   * POST /api/admin/reports/monthly-summary/close-month
   * Body: { yearMonth: string, tenantId: string }. Fecha o mês do tenant (mesmo método do endpoint tenant).
   */
  @Post("monthly-summary/close-month")
  async closeMonth(@Body() body: { yearMonth?: string; tenantId?: string }) {
    const tenantId = body?.tenantId?.trim();
    const yearMonth = body?.yearMonth?.trim() ?? "";
    if (!tenantId) {
      throw new BadRequestException("tenantId é obrigatório no body para acesso admin.");
    }
    const result = await this.monthly.closeMonth({ tenantId, yearMonth });
    return { ok: true, month: result.yearMonth };
  }

  /**
   * GET /api/admin/reports/monthly-summary/pdf?month=YYYY-MM&tenantId=xxx
   * tenantId obrigatório na query.
   */
  @Get("monthly-summary/pdf")
  async getMonthlySummaryPdf(
    @Req() req: any,
    @Query("month") month: string,
    @Query("tenantId") tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!tenantId || !tenantId.trim()) {
      throw new BadRequestException("tenantId é obrigatório na query para acesso admin.");
    }
    const buffer = await this.monthly.getMonthlySummaryPdfBuffer(tenantId.trim(), month ?? "");
    const ym = (month ?? "").trim() || "YYYY-MM";
    const filename = `smartponto-${ym}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  }
}
