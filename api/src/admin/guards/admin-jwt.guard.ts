import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class AdminJwtGuard extends AuthGuard("admin-jwt") {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException("Token inválido");
    }

    // 🔐 Permite SOMENTE SUPER_ADMIN
    if (user.role !== "SUPER_ADMIN") {
      throw new UnauthorizedException(
        "Acesso restrito ao SUPER_ADMIN",
      );
    }

    return user;
  }
}