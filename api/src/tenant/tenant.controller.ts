import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('tenants')
@UseGuards(JwtGuard, RolesGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() body: any) {
    return this.tenantService.createTenant(body);
  }
}
