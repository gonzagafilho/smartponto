import { Module } from '@nestjs/common';
import { TimeentriesController } from './timeentries.controller';
import { TimeentriesService } from './timeentries.service';

@Module({
  controllers: [TimeentriesController],
  providers: [TimeentriesService],
})
export class TimeentriesModule {}
