jest.mock('../../../engine/adapters/whatsapp-web-js.adapter', () => ({
  WhatsAppWebJsAdapter: jest.fn().mockImplementation((config: unknown) => ({ config })),
}));

import { WhatsAppWebJsPlugin } from './index';
import { WhatsAppWebJsAdapter } from '../../../engine/adapters/whatsapp-web-js.adapter';

describe('WhatsAppWebJsPlugin.createEngine (#219)', () => {
  beforeEach(() => {
    (WhatsAppWebJsAdapter as unknown as jest.Mock).mockClear();
  });

  it('prefers per-call config over context/defaults and threads executablePath', () => {
    const plugin = new WhatsAppWebJsPlugin();

    plugin.createEngine({
      sessionId: 'sess-1',
      sessionDataPath: '/data/sessions',
      headless: false,
      puppeteerArgs: ['--single-process'],
      executablePath: '/usr/bin/chromium',
    });

    expect(WhatsAppWebJsAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        sessionDataPath: '/data/sessions',
        puppeteer: { headless: false, args: ['--single-process'], executablePath: '/usr/bin/chromium' },
      }),
    );
  });

  it('falls back to safe defaults when no config is supplied', () => {
    const plugin = new WhatsAppWebJsPlugin();

    plugin.createEngine({ sessionId: 'sess-2' });

    expect(WhatsAppWebJsAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-2',
        sessionDataPath: './data/sessions',
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], executablePath: undefined },
      }),
    );
  });
});
