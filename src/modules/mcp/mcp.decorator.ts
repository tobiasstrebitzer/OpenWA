import { SetMetadata } from '@nestjs/common';
import type { z } from 'zod/v4';

/** Reflect-metadata key carrying `@Mcp` options on a controller method. */
export const MCP_METADATA = '__openwa_mcp__';

/**
 * Options for the `@Mcp()` method decorator. Every field is optional - an empty
 * `@Mcp()` exposes the decorated controller route as an MCP tool with its name,
 * description, and input schema fully reflected from the method's route
 * (`@Get`/`@Post`/...), parameter decorators (`@Param`/`@Query`/`@Body`), and
 * any `@nestjs/swagger` (`@ApiOperation`/`@ApiParam`/`@ApiProperty`) or
 * `class-validator` metadata it carries.
 */
export interface McpMetadata {
  /**
   * MCP tool name override. When unset it is derived from the controller class
   * and method name (e.g. `SessionController.findOne` -> `SessionFindOne`).
   */
  name?: string;
  /**
   * Tool description override. When unset it falls back to the method's
   * `@ApiOperation({ summary | description })`, then a generated default.
   */
  description?: string;
  /**
   * Zod override merged over the reflected input fields (override wins per
   * field). Accepts either a raw shape (`{ field: z.string() }`) or a whole
   * `z.object({ ... })` - the object's `.shape` is unwrapped. The escape hatch
   * for shapes reflection can't express losslessly. Note it *adds to* the
   * reflected fields; it does not replace them.
   */
  input?: Record<string, z.ZodType> | z.ZodObject;
  /**
   * Whether to apply the controller method's parameter-bound pipes
   * (`@Param('id', ParseIntPipe)`) when re-binding the call. Default `'apply'`.
   * Global/`ValidationPipe`, interceptors, and exception filters never run -
   * the method is invoked directly, not through Nest's HTTP request pipeline.
   */
  pipes?: 'apply' | 'skip';
  /**
   * MCP result format for this tool. `'json'` returns compact JSON text;
   * `'smart'` (the default) inlines small payloads and offloads large ones to an
   * embedded resource. A client that sends `_meta.disposition` on the call
   * overrides it.
   */
  result?: 'json' | 'smart';
}

/**
 * Method decorator that exposes an existing NestJS controller route as an MCP
 * tool. It is **additive** - the route keeps serving HTTP exactly as before;
 * `@Mcp()` just opts the method into MCP discovery. It is a pure `SetMetadata`
 * marker (read only when the MCP module loads), so it is inert and carries no
 * runtime cost when MCP is disabled.
 *
 * The tool's name, description, and input schema are reflected from the
 * method's own metadata: fields from the parameter decorators
 * (`@Param`/`@Query`/`@Body`), types/constraints/descriptions from
 * `@nestjs/swagger` and `class-validator`. On a tool call the input is split
 * back into the method's positional arguments and the method is invoked
 * directly (with `@UseGuards` guards applied first).
 *
 * @example
 * ```ts
 * @Get(':channelId')
 * @ApiOperation({ summary: 'Get a specific channel by ID' })
 * @Mcp()
 * findOne(@Param('sessionId') sessionId: string, @Param('channelId') channelId: string) { ... }
 * ```
 */
export function Mcp(options: McpMetadata = {}): MethodDecorator {
  return SetMetadata(MCP_METADATA, options);
}
