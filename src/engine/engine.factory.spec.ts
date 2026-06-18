import { EngineFactory } from './engine.factory';
import { ConfigService } from '@nestjs/config';
import { PluginLoaderService, PluginType } from '../core/plugins';

describe('EngineFactory', () => {
  const engineBlob = {
    type: 'whatsapp-web.js',
    sessionDataPath: '/var/data/sessions',
    puppeteer: { headless: true, args: ['--no-sandbox'], executablePath: '/usr/bin/chromium-browser' },
  };
  const buildConfigService = (overrides: Record<string, unknown> = {}): ConfigService => {
    const values: Record<string, unknown> = {
      'engine.type': 'whatsapp-web.js',
      'engine.sessionDataPath': '/var/data/sessions',
      'engine.puppeteer.headless': true,
      'engine.puppeteer.args': ['--no-sandbox'],
      'engine.puppeteer.executablePath': '/usr/bin/chromium-browser',
      engine: engineBlob,
      ...overrides,
    };
    return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  };

  it('passes ONLY engine-neutral fields to createEngine (no Puppeteer leak)', () => {
    const createEngine = jest.fn().mockReturnValue({});
    const pluginInstance = { type: PluginType.ENGINE, createEngine };
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue({ instance: pluginInstance }),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(buildConfigService(), pluginLoader);
    factory.create({ sessionId: 'sess-1', proxyUrl: 'http://p', proxyType: 'http' });

    // Plain-object (not objectContaining) assertion: any browser key (headless/puppeteerArgs/
    // executablePath/sessionDataPath) leaking into the per-call config would fail this exact match.
    expect(createEngine).toHaveBeenCalledWith({ sessionId: 'sess-1', proxyUrl: 'http://p', proxyType: 'http' });
  });

  it('registers the built-in engine with the opaque engine config blob (#219 guarantee moves to context.config)', async () => {
    const registerBuiltInPlugin = jest.fn();
    const pluginLoader = {
      registerBuiltInPlugin,
      enablePlugin: jest.fn().mockResolvedValue(undefined),
      getPlugin: jest.fn(),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(buildConfigService(), pluginLoader);
    await factory.onModuleInit();

    expect(registerBuiltInPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'whatsapp-web.js', type: PluginType.ENGINE }),
      expect.anything(),
      engineBlob,
    );
  });

  it('falls back to the direct adapter when no engine plugin is available', () => {
    const pluginLoader = {
      getPlugin: jest.fn().mockReturnValue(undefined),
    } as unknown as PluginLoaderService;

    const factory = new EngineFactory(buildConfigService(), pluginLoader);
    expect(() => factory.create({ sessionId: 'sess-2' })).not.toThrow();
  });
});
