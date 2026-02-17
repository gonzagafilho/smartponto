import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: { userId: string; refreshToken: string }) {
    return this.auth.refresh(body.userId, body.refreshToken);
  }

  @Post('logout')
  logout(@Body() body: { userId: string }) {
    return this.auth.logout(body.userId);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@Req() req: any) {
    return { ok: true, user: req.user };
  }
}
