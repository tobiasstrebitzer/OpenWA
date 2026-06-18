import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PluginLoaderService, PluginManifest, PluginType } from '../../core/plugins';
import { AutoReplyPlugin } from './auto-reply';
import { createLogger } from '../../common/services/logger.service';

/**
 * Registers first-party built-in EXTENSION plugins with the (global) PluginLoaderService.
 * Mirrors EngineFactory's registration pattern so src/core never imports a concrete plugin.
 * Built-in extensions are registered DISABLED; operators enable them via POST /plugins/:id/enable.
 */
@Injectable()
export class ExtensionsRegistrar implements OnModuleInit {
  private readonly logger = createLogger('ExtensionsRegistrar');

  constructor(private readonly pluginLoader: PluginLoaderService) {}

  onModuleInit(): void {
    const autoReplyManifest: PluginManifest = {
      id: 'auto-reply',
      name: 'Auto Reply (reference)',
      version: '1.0.0',
      type: PluginType.EXTENSION,
      description: 'Reference extension plugin: replies to inbound direct messages. Disabled by default.',
      main: 'index.ts',
      permissions: ['messages:send'],
      sessions: ['*'],
    };

    this.pluginLoader.registerBuiltInPlugin(autoReplyManifest, new AutoReplyPlugin());
    this.logger.log('Auto-reply reference plugin registered (disabled)');
  }
}

@Module({
  providers: [ExtensionsRegistrar],
})
export class ExtensionsModule {}
