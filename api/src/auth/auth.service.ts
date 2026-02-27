import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // =========================
  // Helpers Refresh Token
  // =========================
  private async hashToken(token: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(token, salt);
  }

  private async verifyTokenHash(token: string, hash: string) {
    return bcrypt.compare(token, hash);
  }

  private refreshExpDate(days = 30) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  private buildPayload(user: {
    id: string;
    tenantId: string | null;
    role: string;
    email: string;
    name: string | null;
  }) {
    return {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      name: user.name,
    };
  }

  // =========================
  // LOGIN
  // =========================
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

    // 1) valida user
    if (!user) throw new UnauthorizedException("Credenciais inválidas");

    // 2) valida senha
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Credenciais inválidas");

    // 3) valida tenantId
    if (!user.tenantId) {
      throw new UnauthorizedException("Usuário sem tenant vinculado");
    }

    // 4) busca tenant e valida isActive
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { isActive: true, slug: true, name: true },
    });

    if (!tenant) throw new UnauthorizedException("Tenant não encontrado");

    if (!tenant.isActive) {
      throw new ForbiddenException("Tenant desativado. Fale com o suporte.");
    }

    // 5) tokens
    const payload = this.buildPayload(user);

    const accessToken = await this.jwt.signAsync(payload, { expiresIn: "15m" });
    const refreshToken = await this.jwt.signAsync(payload, { expiresIn: "30d" });

    // 6) salvar hash do refresh no banco ✅
    const refreshTokenHash = await this.hashToken(refreshToken);
    await this.prisma.user.update({
  where: { id: user.id },
  data: {
    refreshTokenHash: refreshTokenHash,
   },
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
        tenantId: user.tenantId,
        tenant: {
          slug: tenant.slug,
          name: tenant.name,
        },
      },
    };
  }

  // =========================
  // REFRESH
  // =========================
  async refresh(refreshToken: string) {
    // 1) valida assinatura e extrai payload
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch (e) {
      throw new UnauthorizedException("Refresh token inválido");
    }

    const userId = payload?.sub;
    if (!userId) throw new UnauthorizedException("Refresh token inválido");

    // 2) busca user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        refreshTokenHash: true,
      },
    });

    if (!user) throw new UnauthorizedException("Usuário não encontrado");

    // 3) valida tenantId
    if (!user.tenantId) {
      throw new UnauthorizedException("Usuário sem tenant vinculado");
    }

    // 4) tenant ativo
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { isActive: true },
    });

    if (!tenant) throw new UnauthorizedException("Tenant não encontrado");
    if (!tenant.isActive) {
      throw new ForbiddenException("Tenant desativado. Fale com o suporte.");
    }
    // 6) valida hash
    if (!user.refreshTokenHash) {
      throw new UnauthorizedException("Sem refresh salvo (faça login)");
    }

    const ok = await this.verifyTokenHash(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException("Refresh não confere (faça login)");

    // 7) gera novos tokens (rotação)
const newPayload = this.buildPayload(user);

const newAccessToken = await this.jwt.signAsync(newPayload, { expiresIn: "15m" });
const newRefreshToken = await this.jwt.signAsync(newPayload, { expiresIn: "30d" });

// 8) rotaciona hash no banco ✅
const newHash = await this.hashToken(newRefreshToken);

await this.prisma.user.update({
  where: { id: user.id },
  data: {
    refreshTokenHash: newHash,
    // refreshTokenExp: ... (REMOVER por enquanto)
  },
});
    return {
      ok: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // =========================
  // LOGOUT
  // =========================
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { ok: true };
  }
}