import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
  
        const START = new Set(["IN", "LUNCH_IN"]);
        const END = new Set(["OUT", "LUNCH_OUT"]);
  
        for (const d of result.days) {
          // pega todos os punches do dia (já vem em ISO string)
          const punches = (d.punches || []).map((p) => ({
            type: p.type,
            punchedAt: p.punchedAt,
          }));
  
          // firstIn = primeiro START; fallback: primeiro punch
          const firstInObj =
            punches.find((p) => START.has(p.type)) || punches[0] || null;
  
          // lastOut = último END; fallback: último punch
          const lastOutObj =
            [...punches].reverse().find((p) => END.has(p.type)) ||
            punches[punches.length - 1] ||
            null;
  
          const firstIn = firstInObj ? firstInObj.punchedAt : "";
          const lastOut = lastOutObj ? lastOutObj.punchedAt : "";
  
          lines.push(
            `${d.date},${firstIn},${lastOut},${d.workedHHMM},${punches.length}`,
          );
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
