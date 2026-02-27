import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReportsService } from "./reports.service";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("timesheet")
  async timesheet(
    @Req() req: any,
    @Res() res: Response,
    @Query("employeeId") employeeId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("format") format?: string,
  ) {
    const tenantId = req.user?.tenantId as string;

    const result = await this.reports.timesheet({
      tenantId,
      employeeId,
      from,
      to,
    });
    if ((format || "").toLowerCase() === "csv") {
        const lines: string[] = [];
        lines.push("date,firstIn,lastOut,workedHHMM,punchesCount");
      
        for (const d of result.days) {
          const firstIn = d.punches[0]?.punchedAt || "";
          const lastOut = d.punches[d.punches.length - 1]?.punchedAt || "";
          lines.push(`${d.date},${firstIn},${lastOut},${d.workedHHMM},${d.punches.length}`);
        }
      
        const csv = lines.join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="timesheet_${employeeId}_${from}_to_${to}.csv"`,
        );
        return res.status(200).send(csv);
      }      
  
    }
}
