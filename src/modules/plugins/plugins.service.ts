import { Injectable, NotFoundException } from '@nestjs/common';
import { PluginLoaderService, PluginStatus, PluginType, BUILTIN_PLUGIN_IDS } from '../../core/plugins';
import { PluginDto } from './dto/plugin.dto';

@Injectable()
export class PluginsService {
  constructor(private readonly pluginLoader: PluginLoaderService) {}

  findAll(): PluginDto[] {
    // Engines lead the list (the dashboard treats the active engine as primary);
    // everything else (e.g. the MCP plugin) follows in registration order.
    const plugins = [...this.pluginLoader.getAllPlugins()].sort(
      (a, b) => Number(b.manifest.type === PluginType.ENGINE) - Number(a.manifest.type === PluginType.ENGINE),
    );

    return plugins.map(plugin => ({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      type: plugin.manifest.type,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      status: plugin.status,
      config: plugin.config,
      builtIn: BUILTIN_PLUGIN_IDS.includes(plugin.manifest.id),
      provides: plugin.manifest.provides ?? [],
      configSchema: plugin.manifest.configSchema,
      requiresRestart: plugin.manifest.requiresRestart ?? false,
      loadedAt: plugin.loadedAt?.toISOString(),
      enabledAt: plugin.enabledAt?.toISOString(),
      error: plugin.error,
    }));
  }

  findOne(id: string): PluginDto {
    const plugin = this.pluginLoader.getPlugin(id);

    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }

    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      type: plugin.manifest.type,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      status: plugin.status,
      config: plugin.config,
      builtIn: BUILTIN_PLUGIN_IDS.includes(plugin.manifest.id),
      provides: plugin.manifest.provides ?? [],
      configSchema: plugin.manifest.configSchema,
      requiresRestart: plugin.manifest.requiresRestart ?? false,
      loadedAt: plugin.loadedAt?.toISOString(),
      enabledAt: plugin.enabledAt?.toISOString(),
      error: plugin.error,
    };
  }

  async enable(id: string): Promise<{ success: boolean; message: string }> {
    const plugin = this.pluginLoader.getPlugin(id);

    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }

    if (plugin.status === PluginStatus.ENABLED) {
      return { success: true, message: `Plugin ${id} is already enabled` };
    }

    try {
      await this.pluginLoader.enablePlugin(id);
      return { success: true, message: `Plugin ${id} enabled successfully` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disable(id: string): Promise<{ success: boolean; message: string }> {
    const plugin = this.pluginLoader.getPlugin(id);

    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }

    if (plugin.status !== PluginStatus.ENABLED) {
      return { success: true, message: `Plugin ${id} is not enabled` };
    }

    try {
      await this.pluginLoader.disablePlugin(id);
      return { success: true, message: `Plugin ${id} disabled successfully` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  updateConfig(id: string, config: Record<string, unknown>): { success: boolean; message: string } {
    const plugin = this.pluginLoader.getPlugin(id);

    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }

    try {
      this.pluginLoader.updatePluginConfig(id, config);
      return { success: true, message: `Plugin ${id} configuration updated` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async healthCheck(id: string): Promise<{ healthy: boolean; message?: string }> {
    const plugin = this.pluginLoader.getPlugin(id);

    if (!plugin) {
      throw new NotFoundException(`Plugin ${id} not found`);
    }

    if (!plugin.instance?.healthCheck) {
      return { healthy: true, message: 'Plugin does not implement health check' };
    }

    try {
      return await plugin.instance.healthCheck();
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
