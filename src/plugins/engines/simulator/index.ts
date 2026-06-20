/**
 * Simulator Engine Plugin
 * Built-in engine plugin that backs sessions with an in-memory world (no real WhatsApp connection).
 * Used for end-to-end tests across the service layer. Selected with ENGINE_TYPE=simulator.
 */

import { PluginContext, PluginType, IEnginePlugin } from '../../../core/plugins';
import { IWhatsAppEngine } from '../../../engine/interfaces/whatsapp-engine.interface';
import { SimulatorEngineAdapter } from '../../../engine/adapters/simulator.adapter';

export class SimulatorPlugin implements IEnginePlugin {
  type = PluginType.ENGINE as const;
  private context?: PluginContext;

  constructor(private readonly registeredConfig?: Record<string, unknown>) {}

  onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.log('Simulator engine plugin loaded');
    return Promise.resolve();
  }

  onEnable(context: PluginContext): Promise<void> {
    context.logger.log('Simulator engine plugin enabled');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    context.logger.log('Simulator engine plugin disabled');
    return Promise.resolve();
  }

  createEngine(config: Record<string, unknown>): IWhatsAppEngine {
    const sessionId = config.sessionId as string;
    const engineConfig = (this.context?.config ?? this.registeredConfig ?? {}) as {
      simulator?: { scenario?: string };
    };
    const scenarioRef = engineConfig.simulator?.scenario ?? 'baseline';
    // Resolve lazily so @openwa/wa-sim (a dev-only dependency) is required only in simulator mode.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadScenario, loadScenarioFile } = require('@openwa/wa-sim') as typeof import('@openwa/wa-sim');
    const scenario =
      scenarioRef.endsWith('.json') || scenarioRef.includes('/')
        ? loadScenarioFile(scenarioRef)
        : loadScenario(scenarioRef);
    return new SimulatorEngineAdapter({ sessionId, scenario });
  }

  getFeatures(): string[] {
    return [
      'text-messages',
      'typing-indicator',
      'media-messages',
      'location-messages',
      'contact-messages',
      'message-replies',
      'message-forwarding',
      'message-reactions',
      'message-deletion',
      'group-management',
      'read-receipts',
    ];
  }

  getEngineLibrary(): { name: string; version: string } {
    let version = 'unknown';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      version = (require('@openwa/wa-sim/package.json') as { version: string }).version;
    } catch {
      // Keep 'unknown' if the package metadata can't be resolved at runtime.
    }
    return { name: '@openwa/wa-sim', version };
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({ healthy: true, message: 'Simulator engine is available' });
  }
}

export default SimulatorPlugin;
