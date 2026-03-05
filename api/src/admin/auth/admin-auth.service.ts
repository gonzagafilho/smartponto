import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        passwordHash: true,
      },
    });

    // 1️⃣ valida user
    if (!user) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    // 2️⃣ valida senha
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    // 3️⃣ permite somente admins globais (SUPER_ADMIN ou ADMIN_GLOBAL)
    const adminGlobalRoles = ["SUPER_ADMIN", "ADMIN_GLOBAL"];
    if (!adminGlobalRoles.includes(user.role)) {
      throw new UnauthorizedException(
        "Acesso restrito a administradores globais",
      );
    }

    // 4️⃣ payload admin (não precisa tenant)
    const payload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: "15m",
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: "30d",
    });

    return {
      ok: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}