import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

type Tokens = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  private signTokens(payload: any): Tokens {
    const accessSecret = this.cfg.get<string>('JWT_ACCESS_SECRET') || '';
    const refreshSecret = this.cfg.get<string>('JWT_REFRESH_SECRET') || '';

    // Logs seguros (NÃO expõem o secret)
    console.log('[SIGN] accessSecret loaded:', !!accessSecret);
    console.log(
      '[SIGN] accessSecret sha1:',
      crypto.createHash('sha1').update(accessSecret).digest('hex'),
    );
    console.log('[SIGN] refreshSecret loaded:', !!refreshSecret);
    console.log(
      '[SIGN] refreshSecret sha1:',
      crypto.createHash('sha1').update(refreshSecret).digest('hex'),
    );

    if (!accessSecret || !refreshSecret) {
      throw new UnauthorizedException('JWT secrets não configurados');
    }

    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: '30d' });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    // ✅ payload padronizado: tenantId + companyId (compatibilidade)
    const payload = {
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId ?? null,
      companyId: user.tenantId ?? null,
    };

    const tokens = this.signTokens(payload);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      ...tokens,
    };
  }

  /**
   * Refresh por refreshToken (controller envia só o token; userId vem do payload).
   */
  async refresh(refreshToken: string) {
    const refreshSecret = this.cfg.get<string>('JWT_REFRESH_SECRET') || '';
    if (!refreshSecret) throw new UnauthorizedException('JWT não configurado');

    let payload: { sub: string; role?: string; tenantId?: string | null };
    try {
      payload = jwt.verify(refreshToken, refreshSecret) as any;
    } catch {
      throw new UnauthorizedException('Sessão inválida');
    }
    const userId = payload?.sub;
    if (!userId) throw new UnauthorizedException('Sessão inválida');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Sessão inválida');
    }

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Sessão inválida');

    const newPayload = {
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId ?? null,
      companyId: user.tenantId ?? null,
    };

    const tokens = this.signTokens(newPayload);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      ok: true,
      ...tokens,
    };
  }

  /**
   * Login do funcionário por CPF (sem senha; usado pelo app de ponto).
   */
  async employeeLogin(cpfRaw: string) {
    const cpf = String(cpfRaw ?? '').replace(/\D/g, '');
    if (cpf.length !== 11) throw new UnauthorizedException('CPF inválido');

    const emp = await this.prisma.employee.findFirst({
      where: { cpf, isActive: true },
      select: { id: true, name: true, cpf: true, tenantId: true },
    });
    if (!emp) throw new UnauthorizedException('CPF não encontrado ou inativo');

    const payload = {
      sub: emp.id,
      role: 'EMPLOYEE',
      tenantId: emp.tenantId ?? null,
      companyId: emp.tenantId ?? null,
    };

    const tokens = this.signTokens(payload);

    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.employee.update({
      where: { id: emp.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      ok: true,
      employee: { id: emp.id, name: emp.name, cpf: emp.cpf, tenantId: emp.tenantId },
      ...tokens,
    };
  }

  async logout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (user) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      });
    }
    const emp = await this.prisma.employee.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (emp) {
      await this.prisma.employee.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      });
    }
    return { ok: true };
  }
}
