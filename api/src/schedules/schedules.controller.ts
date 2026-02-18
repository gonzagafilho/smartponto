import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { SchedulesService } from "./schedules.service";

@Controller("schedules")
@UseGuards(JwtGuard, RolesGuard)
export class SchedulesController {
  constructor(private readonly svc: SchedulesService) {}

  private tenantId(req: any) {
    const t = req.user?.tenantId;
    if (!t) throw new Error("tenantId ausente no token");
    return t;
  }

  @Get()
  @Roles("TENANT_ADMIN", "TENANT_MANAGER")
  list(@Req() req: any) {
    return this.svc.list(this.tenantId(req));
  }

  @Post()
  @Roles("TENANT_ADMIN")
  create(@Req() req: any, @Body() body: any) {
    return this.svc.create(this.tenantId(req), body);
  }

  @Patch(":id")
  @Roles("TENANT_ADMIN")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.svc.update(this.tenantId(req), id, body);
  }

  @Delete(":id")
  @Roles("TENANT_ADMIN")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.svc.remove(this.tenantId(req), id);
  }
}
