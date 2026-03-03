import { Body, Controller, Get, Post, UseGuards, Req } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtGuard } from "../guards/admin-jwt.guard";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("login")
  async login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(AdminJwtGuard)
  @Get("me")
  async me(@Req() req: any) {
    return { ok: true, admin: req.user };
  }
}