import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AdminTenantsController } from "./admin-tenants.controller";
import { AdminTenantsService } from "./admin-tenants.service";

@Module({
  imports: [PrismaModule],
  controllers: [AdminTenantsController],
  providers: [AdminTenantsService],
})
export class AdminTenantsModule {}