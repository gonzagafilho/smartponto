import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkHoursController } from "./work-hours.controller";
import { WorkHoursService } from "./work-hours.service";

@Module({
  imports: [PrismaModule],
  controllers: [WorkHoursController],
  providers: [WorkHoursService],
  exports: [WorkHoursService],
})
export class WorkHoursModule {}
