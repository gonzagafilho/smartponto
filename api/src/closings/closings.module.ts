import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ClosingsController } from "./closings.controller";
import { ClosingsService } from "./closings.service";

@Module({
  imports: [PrismaModule],
  controllers: [ClosingsController],
  providers: [ClosingsService],
  exports: [ClosingsService],
})
export class ClosingsModule {}
