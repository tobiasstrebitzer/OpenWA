import { IPlugin, PluginContext, PluginManifest, PluginType } from '../plugin.interfaces';
import { updateGeneratedEnv } from '../../../common/utils/env-file';

export const MCP_PLUGIN_ID = 'mcp';

export const mcpPluginManifest: PluginManifest = {
  id: MCP_PLUGIN_ID,
  name: 'MCP Server',
  version: '0.2.3',
  type: PluginType.EXTENSION,
  description: 'Let AI assistants like Claude control WhatsApp through the Model Context Protocol (MCP).',
  author: 'OpenWA',
  main: '(built-in)',
  requiresRestart: true,
};

export class McpBuiltinPlugin implements IPlugin {
  onEnable(context: PluginContext): Promise<void> {
    updateGeneratedEnv({ MCP_ENABLED: 'true' });
    context.logger.warn('MCP enabled — restart the server to mount the MCP transport');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    updateGeneratedEnv({ MCP_ENABLED: 'false' });
    context.logger.warn('MCP disabled — restart the server to unmount the MCP transport');
    return Promise.resolve();
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const live = process.env.MCP_ENABLED === 'true';
    return Promise.resolve(
      live
        ? { healthy: true, message: 'MCP mounted at /mcp' }
        : { healthy: true, message: 'MCP not mounted (restart required after enabling)' },
    );
  }
}
