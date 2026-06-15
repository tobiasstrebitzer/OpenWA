import { Module } from '@nestjs/common';
import { PluginsActions } from './plugins.actions';
import { PluginsService } from './plugins.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Module({
  providers: [PluginsActions, ApiKeyGuard, PluginsService],
  exports: [PluginsService],
})
export class PluginsApiModule {}
