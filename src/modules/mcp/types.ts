import type { CanActivate, Type } from '@nestjs/common';
import type { z } from 'zod/v4';

/** Stand-in for the HTTP request reconstructed for an MCP tool call. */
export interface McpRequestLike {
  headers?: Record<string, unknown>;
  url?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * A discovered MCP tool: the reflected schema plus a `run` that applies the
 * route's guards and invokes the underlying controller method. Carries no
 * coupling to the MCP SDK so it can be discovered and unit-tested without it.
 */
export interface McpTool {
  /** Tool name, e.g. `SessionFindOne`. */
  name: string;
  /** Human-readable description (from `@ApiOperation` or a generated default). */
  description: string;
  /** Raw Zod input shape, passed straight to the SDK's `registerTool`. */
  inputShape: Record<string, z.ZodType>;
  /** When true, a whole-body param reflected no fields - register the schema as
   * passthrough so the client's body keys survive validation. */
  passthrough?: boolean;
  /** Default result disposition for this tool. */
  disposition?: 'json' | 'smart';
  /**
   * Apply the route's guards against the reconstructed `request`, then invoke
   * the controller method with the validated `input`. Throws if a guard rejects.
   */
  run: (input: Record<string, unknown>, request: McpRequestLike | undefined) => Promise<unknown>;
}

export interface McpModuleOptions {
  /** URL path the Streamable-HTTP transport mounts on. Default `/mcp`. */
  basePath?: string;
  /** Identity surfaced to MCP clients. */
  serverInfo?: { name: string; description?: string; version: string };
  /**
   * Opt-in allow-list of app-global guard classes (registered via
   * `app.useGlobalGuards()` or `{ provide: APP_GUARD, useClass }`) to run on
   * every MCP tool call, before each method/class `@UseGuards`. Listed by
   * class - a blanket "run all globals" is deliberately not offered, since
   * unrelated globals (e.g. a throttler that needs a writable response) would
   * misbehave over MCP. Empty/omitted => no global guards run.
   */
  globalGuards?: Type<CanActivate>[];
  /** Default MCP result format for every tool. Defaults to `'smart'`. */
  defaultResult?: 'json' | 'smart';
}

export const MCP_MODULE_OPTIONS = '__openwa_mcp_module_options__';
