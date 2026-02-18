import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, PrismaService],
})
export class UploadsModule {}
