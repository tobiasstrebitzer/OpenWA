import { Module } from '@nestjs/common';
import { ChannelActions } from './channel.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [ChannelActions, ApiKeyGuard],
})
export class ChannelModule {}
