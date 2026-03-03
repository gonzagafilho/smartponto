import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { PrismaService } from "../prisma/prisma.service";

import { AdminAuthController } from "./auth/admin-auth.controller";
import { AdminAuthService } from "./auth/admin-auth.service";
import { AdminJwtStrategy } from "./auth/admin-jwt.strategy";

import { AdminTenantsController } from "./tenants/admin-tenants.controller";
import { AdminTenantsService } from "./tenants/admin-tenants.service";

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => {
    const secret = cfg.get<string>("ADMIN_JWT_SECRET") || "dev_admin_secret_change_me";
    const expiresIn = (cfg.get<string>("ADMIN_JWT_EXPIRES_IN") || "7d") as any;

    return {
      secret,
      signOptions: { expiresIn },
    };
  },
}),
  ],
  controllers: [AdminAuthController, AdminTenantsController],
  providers: [PrismaService, AdminAuthService, AdminTenantsService, AdminJwtStrategy],
})
export class AdminModule {}