import { Module } from '@nestjs/common';
import { StatusActions } from './status.actions';
import { StatusService } from './status.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [StatusActions, ApiKeyGuard, StatusService],
  exports: [StatusService],
})
export class StatusModule {}
