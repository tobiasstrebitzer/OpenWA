import { isIPv4, isIPv6 } from 'net';
import { lookup } from 'dns/promises';

/** Thrown when an outbound webhook URL is blocked by the SSRF guard. */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/** Opt-in: outbound webhook SSRF protection is only active when WEBHOOK_SSRF_PROTECT=true. */
export function isSsrfProtectionEnabled(): boolean {
  return process.env.WEBHOOK_SSRF_PROTECT === 'true';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function inCidr4(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) >>> 0 === (baseInt & mask) >>> 0;
}

// IPv4 ranges that must never be reachable by an outbound webhook (SSRF targets).
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this" network / unspecified
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. 169.254.169.254 cloud metadata)
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

/**
 * Whether an IP literal points at an internal/reserved range that an outbound
 * webhook must not be allowed to reach (loopback, RFC1918, link-local/metadata,
 * CGNAT, multicast, IPv6 loopback/ULA/link-local, IPv4-mapped variants).
 * Anything that isn't a recognizable public IP is treated as blocked (fail-closed).
 */
export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits));
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;

    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) — classify by the embedded IPv4, handling
    // BOTH the dotted-decimal and the hex-hextet form (the hex form bypassed a dotted-only regex).
    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice('::ffff:'.length);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
        return isBlockedAddress(tail);
      }
      const hextets = tail.split(':');
      if (hextets.length === 2 && hextets.every(h => /^[0-9a-f]{1,4}$/.test(h))) {
        const hi = parseInt(hextets[0], 16);
        const lo = parseInt(hextets[1], 16);
        return isBlockedAddress(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
      }
    }

    const firstHextet = lower.split(':')[0];
    if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(firstHextet)) return true; // link-local fe80::/10
    return false;
  }

  // Not a valid IP literal — cannot verify, so block.
  return true;
}

/**
 * Resolves an outbound webhook URL and throws SsrfBlockedError if its scheme is not
 * http(s) or if the host (literal or any DNS-resolved address) is internal/reserved.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Invalid webhook URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Blocked webhook URL scheme: ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (isIPv4(host) || isIPv6(host)) {
    if (isBlockedAddress(host)) {
      throw new SsrfBlockedError(`Blocked internal webhook address: ${host}`);
    }
    return;
  }

  const resolved = await lookup(host, { all: true });
  if (resolved.length === 0) {
    throw new SsrfBlockedError(`Could not resolve webhook host: ${host}`);
  }
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError(`Webhook host ${host} resolves to a blocked internal address: ${address}`);
    }
  }
}
