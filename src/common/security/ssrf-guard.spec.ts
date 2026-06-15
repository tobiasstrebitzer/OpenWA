import { isBlockedAddress, assertSafeWebhookUrl, SsrfBlockedError, isSsrfProtectionEnabled } from './ssrf-guard';

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['10.1.2.3', 'RFC1918 10/8'],
    ['172.16.5.5', 'RFC1918 172.16/12'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'link-local / cloud metadata'],
    ['100.64.0.1', 'CGNAT 100.64/10'],
    ['0.0.0.0', 'unspecified'],
    ['::1', 'IPv6 loopback'],
    ['fc00::1', 'IPv6 ULA fc00::/7'],
    ['fd12:3456::1', 'IPv6 ULA fd'],
    ['fe80::1', 'IPv6 link-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback (dotted)'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback (hex)'],
    ['::ffff:0a00:0001', 'IPv4-mapped RFC1918 (hex, zero-padded)'],
    ['::ffff:a9fe:a9fe', 'IPv4-mapped cloud metadata 169.254.169.254 (hex)'],
  ])('blocks %s (%s)', ip => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public IPv4'],
    ['1.1.1.1', 'public IPv4'],
    ['172.32.0.1', 'just outside 172.16/12'],
    ['2001:4860:4860::8888', 'public IPv6'],
    ['::ffff:0808:0808', 'IPv4-mapped public 8.8.8.8 (hex)'],
  ])('allows %s (%s)', ip => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('assertSafeWebhookUrl', () => {
  it('rejects a non-http(s) scheme', async () => {
    await expect(assertSafeWebhookUrl('ftp://example.com/hook')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects a literal loopback IPv4 host', async () => {
    await expect(assertSafeWebhookUrl('http://127.0.0.1/hook')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects the cloud metadata IP', async () => {
    await expect(assertSafeWebhookUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects a literal IPv6 loopback host', async () => {
    await expect(assertSafeWebhookUrl('http://[::1]:8080/hook')).rejects.toThrow(SsrfBlockedError);
  });

  it('rejects a hostname that resolves to loopback (localhost)', async () => {
    await expect(assertSafeWebhookUrl('http://localhost:9999/hook')).rejects.toThrow(SsrfBlockedError);
  });

  it('allows a public literal IP', async () => {
    await expect(assertSafeWebhookUrl('https://8.8.8.8/hook')).resolves.toBeUndefined();
  });
});

describe('isSsrfProtectionEnabled', () => {
  const orig = process.env.WEBHOOK_SSRF_PROTECT;
  afterEach(() => {
    process.env.WEBHOOK_SSRF_PROTECT = orig;
  });

  it('is off by default and on only when explicitly "true"', () => {
    delete process.env.WEBHOOK_SSRF_PROTECT;
    expect(isSsrfProtectionEnabled()).toBe(false);
    process.env.WEBHOOK_SSRF_PROTECT = 'true';
    expect(isSsrfProtectionEnabled()).toBe(true);
  });
});
