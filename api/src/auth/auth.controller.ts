import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RefreshDto } from "./dto/refresh.dto";
import { EmployeeLoginDto } from "./dto/employee-login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  // ✅ Login do funcionário por CPF
  @Post("employee-login")
  async employeeLogin(@Body() body: EmployeeLoginDto) {
    return this.authService.employeeLogin(body.cpf);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: any) {
    return { ok: true, user: req.user };
  }

  @Post("refresh")
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.sub);
  }
}