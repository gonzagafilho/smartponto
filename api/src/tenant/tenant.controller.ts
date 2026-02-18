import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TenantService } from "./tenant.service";

@UseGuards(JwtAuthGuard)
@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  async create(@Body() body: any) {
    // aceita ambos pra não quebrar: name ou tenantName
    const name = body.name ?? body.tenantName;

    return this.tenantService.createTenant({
      name,
      slug: body.slug,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    });
  }
}
