import { Module } from '@nestjs/common';
import { GroupActions } from './group.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [GroupActions, ApiKeyGuard],
})
export class GroupModule {}
