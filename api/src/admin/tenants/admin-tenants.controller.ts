import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsString, MinLength } from "class-validator";
import { AdminJwtGuard } from "../guards/admin-jwt.guard";
import { AdminTenantsService } from "./admin-tenants.service";
import { CreateAdminTenantDto } from "./dto/create-admin-tenant.dto";

class SetTenantActiveDto {
  @IsBoolean()
  isActive: boolean;
}

class ResetTenantAdminPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}

@Controller("admin/tenants")
@UseGuards(AdminJwtGuard)
export class AdminTenantsController {
  constructor(private readonly service: AdminTenantsService) {}

  @Get()
  async list() {
    return this.service.list();
  }

  @Post()
  async create(@Body() dto: CreateAdminTenantDto) {
    return this.service.create(dto);
  }

  @Patch(":id/active")
  async setActive(@Param("id") id: string, @Body() dto: SetTenantActiveDto) {
    return this.service.setActive(id, dto.isActive);
  }

  @Post(":id/reset-admin-password")
  async resetAdminPassword(@Param("id") id: string, @Body() dto: ResetTenantAdminPasswordDto) {
    return this.service.resetTenantAdminPassword(id, dto.newPassword);
  }
}