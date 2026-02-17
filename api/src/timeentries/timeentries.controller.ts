import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TimeentriesService } from './timeentries.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('timeentries')
@UseGuards(JwtGuard, RolesGuard)
export class TimeentriesController {
  constructor(private readonly svc: TimeentriesService) {}

  private tenantId(req: any) {
    const t = req.user?.tenantId;
    if (!t) throw new Error('tenantId ausente no token');
    return t;
  }

  @Post('punch')
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  punch(@Req() req: any, @Body() body: any) {
    return this.svc.punch(this.tenantId(req), body);
  }

  @Get()
  @Roles('TENANT_ADMIN', 'TENANT_MANAGER')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.list(this.tenantId(req), q);
  }
}
