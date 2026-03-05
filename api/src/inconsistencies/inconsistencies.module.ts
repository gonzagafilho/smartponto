import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { InconsistenciesController } from "./inconsistencies.controller";
import { InconsistenciesService } from "./inconsistencies.service";

@Module({
  imports: [PrismaModule],
  controllers: [InconsistenciesController],
  providers: [InconsistenciesService],
  exports: [InconsistenciesService],
})
export class InconsistenciesModule {}
