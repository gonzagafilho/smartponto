import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

type Tokens = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  private signTokens(payload: any): Tokens {
    const accessToken = jwt.sign(payload, this.cfg.get<string>('JWT_ACCESS_SECRET')!, {
      expiresIn: '15m',
    });

    const refreshToken = jwt.sign(payload, this.cfg.get<string>('JWT_REFRESH_SECRET')!, {
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const payload = { sub: user.id, role: user.role, tenantId: user.tenantId ?? null };
    const tokens = this.signTokens(payload);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      ok: true,
      user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId },
      ...tokens,
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Sessão inválida');

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Sessão inválida');

    const payload = { sub: user.id, role: user.role, tenantId: user.tenantId ?? null };
    const tokens = this.signTokens(payload);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    return { ok: true, ...tokens };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { ok: true };
  }
}
