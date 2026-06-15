import { Module } from '@nestjs/common';
import { LabelActions } from './label.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [LabelActions, ApiKeyGuard],
})
export class LabelModule {}
