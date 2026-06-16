/**
 * Jest stub for the ESM-only `@silkweave/nestjs` package.
 *
 * `@silkweave/*` ship as ESM and cannot be loaded by the CommonJS Jest runtime
 * (ts-jest). A handful of unit specs import controllers directly, and those
 * controllers eagerly `import { Mcp } from '@silkweave/nestjs'`. `@Mcp()` is a
 * purely additive metadata decorator (inert unless MCP is enabled at runtime),
 * so a no-op decorator is a faithful stand-in for unit tests.
 *
 * Wired via `jest.moduleNameMapper` in package.json.
 */
export const Mcp =
  () =>
  (_target: object, _key?: string | symbol, descriptor?: PropertyDescriptor): PropertyDescriptor | void =>
    descriptor;
