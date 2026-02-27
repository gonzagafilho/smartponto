import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { MonthlyController } from "./monthly.controller";
import { MonthlyService } from "./monthly.service";

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, MonthlyController],
  providers: [ReportsService, MonthlyService],
})
export class ReportsModule {}