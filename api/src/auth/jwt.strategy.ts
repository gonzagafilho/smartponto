// src/auth/jwt.strategy.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly cfg: ConfigService) {
    const secret = cfg.get<string>("JWT_ACCESS_SECRET");
    if (!secret) {
      // Diagnóstico: se cair aqui, o .env não está carregando no runtime do PM2
      throw new Error("JWT_ACCESS_SECRET NOT LOADED");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    return payload;
  }
}
