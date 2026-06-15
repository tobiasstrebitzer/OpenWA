import { EngineFactory } from './engine.factory';
import { ConfigService } from '@nestjs/config';
import { PluginLoaderService, PluginType } from '../core/plugins';

describe('EngineFactory', () => {
  const buildConfigService = (overrides: Record<string, unknown> = {}): ConfigService => {
    const values: Record<string, unknown> = {
      'engine.type': 'whatsapp-web.js',
      'engine.sessionDataPath': '/var/data/sessions',
      'engine.puppeteer.headless': true,
      'engine.puppeteer.args': ['--no-sandbox'],
      'engine.puppeteer.executablePath': '/usr/bin/chromium-browser',
      ...overrides,
    };
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  };

  it('threads the resolved puppeteer config (executablePath/sessionDataPath) to the plugin — #219', () => {
    const createEngine = jest.fn().mockReturnValue({});
    const pluginInstance = { type: PluginType.ENGINE, createEngine };
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue({ instance: pluginInstance }),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(buildConfigService(), pluginLoader);
    factory.create({ sessionId: 'sess-1' });

    // Finding 2: the built-in plugin registers with an empty context config, so the
    // factory must resolve and pass these through — otherwise sessionDataPath and the
    // executable path silently fall back to relative-path defaults.
    expect(createEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        sessionDataPath: '/var/data/sessions',
        headless: true,
        puppeteerArgs: ['--no-sandbox'],
        executablePath: '/usr/bin/chromium-browser',
      }),
    );
  });

  it('falls back to the direct adapter (with executablePath) when no engine plugin is available', () => {
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue(undefined),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(buildConfigService(), pluginLoader);

    // The fallback path must not throw and must produce an engine instance even when
    // the plugin registry is empty (legacy support).
    expect(() => factory.create({ sessionId: 'sess-2' })).not.toThrow();
  });
});
