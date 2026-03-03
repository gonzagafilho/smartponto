import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AdminAuthController } from "./auth/admin-auth.controller";
import { AdminAuthService } from "./auth/admin-auth.service";
import { AdminJwtGuard } from "./guards/admin-jwt.guard";
import { AdminJwtStrategy } from "./auth/admin-jwt.strategy";

import { AdminTenantsController } from "./tenants/admin-tenants.controller";
import { AdminTenantsService } from "./tenants/admin-tenants.service";

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>("JWT_ADMIN_SECRET");
        if (!secret) throw new Error("JWT_ADMIN_SECRET não definido no .env");

        return {
          secret,
          signOptions: { expiresIn: "7d" },
        };
      },
    }),
  ],
  controllers: [AdminAuthController, AdminTenantsController],
  providers: [
    AdminAuthService,
    AdminTenantsService,
    AdminJwtGuard,
    AdminJwtStrategy,
  ],
})
export class AdminModule {}