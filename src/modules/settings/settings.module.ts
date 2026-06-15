import { Module } from '@nestjs/common';
import { SettingsActions } from './settings.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Module({
  providers: [SettingsActions, ApiKeyGuard],
})
export class SettingsModule {}
