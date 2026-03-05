import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MonthlyController } from "./monthly.controller";
import { MonthlyService } from "./monthly.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, MonthlyController],
  providers: [ReportsService, MonthlyService],
  exports: [MonthlyService],
})
export class ReportsModule {}
