import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsActions } from './stats.actions';
import { StatsService } from './stats.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Message], 'data')],
  providers: [StatsActions, ApiKeyGuard, StatsService],
  exports: [StatsService],
})
export class StatsModule {}
