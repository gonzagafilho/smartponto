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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    EmployeesModule,
    WorksitesModule,
    TimeentriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
