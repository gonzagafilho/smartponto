import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('employees')
@UseGuards(JwtGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  private tenantId(req: any) {
    const t = req.user?.tenantId;
    if (!t) throw new Error('tenantId ausente no token');
    return t;
  }

  @Get()
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  list(@Req() req: any) {
    return this.employees.list(this.tenantId(req));
  }

  @Post()
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  create(@Req() req: any, @Body() body: any) {
    return this.employees.create(this.tenantId(req), body);
  }

  @Patch(':id')
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.employees.update(this.tenantId(req), id, body);
  }

  @Delete(':id')
  @Roles('TENANT_ADMIN')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.employees.remove(this.tenantId(req), id);
  }
}
