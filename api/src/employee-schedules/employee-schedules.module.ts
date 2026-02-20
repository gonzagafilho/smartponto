import { Module } from '@nestjs/common';
import { EmployeeSchedulesController } from './employee-schedules.controller';
import { EmployeeSchedulesService } from './employee-schedules.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [EmployeeSchedulesController],
  providers: [EmployeeSchedulesService, PrismaService],
  exports: [EmployeeSchedulesService],
})
export class EmployeeSchedulesModule {}
