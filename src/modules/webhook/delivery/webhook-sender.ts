import { assertSafeFetchUrl, assertNoRedirect, isSsrfProtectionEnabled } from '../../../common/security/ssrf-guard';

export interface SendWebhookOptions {
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

/**
 * The single guarded outbound webhook request, shared by direct delivery, the queue processor, and
 * the test endpoint. When SSRF protection is on it pre-checks the URL, sends with redirect:'manual',
 * and refuses any redirect (so a 3xx to an internal host can't bypass the pre-check). Returns the
 * raw Response; callers decide what a non-2xx status means. Throws SsrfBlockedError if the guard
 * trips, or the usual fetch/timeout errors otherwise.
 */
export async function sendGuardedWebhook(
  url: string,
  { headers, body, timeoutMs }: SendWebhookOptions,
): Promise<Response> {
  const ssrfProtected = isSsrfProtectionEnabled();
  if (ssrfProtected) {
    await assertSafeFetchUrl(url);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: ssrfProtected ? 'manual' : 'follow',
  });
  if (ssrfProtected) {
    assertNoRedirect(response, url);
  }
  return response;
}
