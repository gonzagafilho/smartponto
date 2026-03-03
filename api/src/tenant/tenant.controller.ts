import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { TenantService } from "./tenant.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";

@Controller("tenants")
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  // ✅ LISTAR TENANTS (admin master)
  @Get()
  @Roles("TENANT_ADMIN") // temporário (depois vira SYSTEM_ADMIN)
  list() {
    return this.tenantService.listTenants();
  }

  // ✅ CRIAR TENANT + CRIAR ADMIN DO TENANT
  @Post()
  @Roles("TENANT_ADMIN") // temporário (depois vira SYSTEM_ADMIN)
  async create(@Body() body: CreateTenantDto) {
    const rawName = body.name ?? body.tenantName;

    if (!rawName || !rawName.trim()) {
      throw new BadRequestException("Campo obrigatório: name (ou tenantName)");
    }

    const name: string = rawName.trim();

    return this.tenantService.createTenant({
      name,
      slug: body.slug,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    });
  }
}