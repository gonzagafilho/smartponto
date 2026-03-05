import { Controller, Get, Param, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ClosingsService } from "./closings.service";

@UseGuards(JwtAuthGuard)
@Controller("closings")
export class ClosingsController {
  constructor(private readonly closings: ClosingsService) {}

  private tenantId(req: any): string {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  /**
   * GET /api/closings/:month/pdf
   * Relatório PDF do fechamento mensal (resumos já fechados).
   * Template A4 com logo SmartPonto, lista de funcionários e totais. Download.
   */
  @Get(":month/pdf")
  async getMonthPdf(
    @Req() req: any,
    @Param("month") month: string,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = this.tenantId(req);
    const buffer = await this.closings.generatePdfBuffer(tenantId, month);
    const filename = `SmartPonto-fechamento-${month}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  }
}
