import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { EmployeeSchedulesService } from './employee-schedules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employee-schedules')
export class EmployeeSchedulesController {
  constructor(private readonly service: EmployeeSchedulesService) {}

  private tenantId(req: any) {
    return req.user?.tenantId;
  }

  @Get()
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  list(@Req() req: any, @Query('employeeId') employeeId?: string) {
    return this.service.list(this.tenantId(req), employeeId);
  }

  @Post()
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  create(@Req() req: any, @Body() body: any) {
    return this.service.create(this.tenantId(req), body);
  }
}
