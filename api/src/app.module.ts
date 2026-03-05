import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { EmployeesModule } from './employees/employees.module';
import { WorksitesModule } from './worksites/worksites.module';
import { TimeentriesModule } from './timeentries/timeentries.module';
import { UploadsModule } from "./uploads/uploads.module";
import { SchedulesModule } from "./schedules/schedules.module";
import { EmployeeSchedulesModule } from './employee-schedules/employee-schedules.module';
import { ReportsModule } from "./reports/reports.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { WorkHoursModule } from "./work-hours/work-hours.module";
import { ClosingsModule } from "./closings/closings.module";
import { InconsistenciesModule } from "./inconsistencies/inconsistencies.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "/home/servidor-dcnet/apps/smartponto/api/.env",
    }),
    PrismaModule,
    AuthModule,
    TenantModule,
    EmployeesModule,
    WorksitesModule,
    TimeentriesModule,
    UploadsModule,
    SchedulesModule,
    EmployeeSchedulesModule,
    ReportsModule,
    DashboardModule,
    WorkHoursModule,
    ClosingsModule,
    InconsistenciesModule,
    AnalyticsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
