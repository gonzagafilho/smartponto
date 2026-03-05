import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Roles com permissão global (admin do sistema). Não inclui TENANT_ADMIN. */
const ADMIN_GLOBAL_ROLES = ["SUPER_ADMIN", "ADMIN_GLOBAL"];

@Injectable()
export class AdminJwtGuard extends AuthGuard("admin-jwt") {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException("Token inválido");
    }

    if (!ADMIN_GLOBAL_ROLES.includes(user.role)) {
      throw new UnauthorizedException(
        "Acesso restrito a administradores globais (SUPER_ADMIN / ADMIN_GLOBAL)",
      );
    }

    return user;
  }
}