import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import * as jwt from "jsonwebtoken";

/**
 * Aceita token de tenant (JWT_ACCESS_SECRET) ou de admin (ADMIN_JWT_SECRET).
 * Para admin, define req.user.tenantId a partir de req.query.tenantId (obrigatório para PDF).
 */
@Injectable()
export class JwtOrAdminJwtGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException("Token não informado");
    }

    const adminSecret =
      this.config.get<string>("ADMIN_JWT_SECRET") || "dev_admin_secret_change_me";
    const tenantSecret = this.config.get<string>("JWT_ACCESS_SECRET");

    // 1) Tenta admin
    try {
      const adminPayload = jwt.verify(token, adminSecret) as any;
      if (adminPayload?.role === "SUPER_ADMIN") {
        request.user = {
          ...adminPayload,
          tenantId: request.query?.tenantId as string | undefined,
        };
        return true;
      }
    } catch {
      // não é token admin ou inválido
    }

    // 2) Tenta tenant
    if (tenantSecret) {
      try {
        const tenantPayload = jwt.verify(token, tenantSecret) as any;
        request.user = {
          userId: tenantPayload.sub,
          role: tenantPayload.role,
          tenantId: tenantPayload.tenantId ?? tenantPayload.companyId ?? null,
          companyId: tenantPayload.companyId ?? tenantPayload.tenantId ?? null,
        };
        return true;
      } catch {
        // não é token tenant
      }
    }

    throw new UnauthorizedException("Token inválido");
  }
}
