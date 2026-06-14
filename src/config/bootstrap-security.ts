export interface CorsPolicy {
  /** Explicit origin allowlist (empty when none / wildcard blocked). */
  origins: string[];
  /** Whether any origin is allowed (wildcard) — never true in production. */
  allowAnyOrigin: boolean;
  /** CORS credentials are only allowed with an explicit allowlist (never with a wildcard). */
  credentials: boolean;
}

/**
 * Resolves the effective CORS policy from CORS_ORIGINS + NODE_ENV.
 * - Dev: wildcard allowed (no credentials with wildcard — spec-compliant).
 * - Prod: a wildcard origin is REFUSED (collapses to same-origin only) so a
 *   misconfigured deployment cannot reflect arbitrary origins with credentials.
 */
export function resolveCorsPolicy(corsOriginsEnv?: string, nodeEnv?: string): CorsPolicy {
  const origins = corsOriginsEnv
    ?.split(',')
    .map(o => o.trim())
    .filter(Boolean) ?? ['*'];
  const hasWildcard = origins.includes('*');

  // In production a wildcard origin is refused: collapse to same-origin only.
  if (hasWildcard && nodeEnv === 'production') {
    return { origins: [], allowAnyOrigin: false, credentials: false };
  }

  return {
    origins,
    allowAnyOrigin: hasWildcard,
    // Credentials are only safe with an explicit allowlist, never with a wildcard.
    credentials: !hasWildcard,
  };
}

/** Swagger UI is served unless ENABLE_SWAGGER=false (default on, backward compatible). */
export function isSwaggerEnabled(enableSwaggerEnv?: string): boolean {
  return enableSwaggerEnv !== 'false';
}

/** Request body-size cap (DoS hardening). Default is media-aware (base64 sends ride in the JSON body). */
export function resolveBodyLimit(bodySizeEnv?: string): string {
  const trimmed = bodySizeEnv?.trim();
  return trimmed ? trimmed : '25mb';
}
