/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, type CanActivate, type Type } from '@nestjs/common';
import { ApplicationConfig, DiscoveryService, MetadataScanner, ModuleRef, Reflector } from '@nestjs/core';
import { z } from 'zod/v4';
import { collectGlobalGuards, collectGuards, runGuards } from './guards';
import { MCP_METADATA } from './mcp.decorator';
import type { McpMetadata } from './mcp.decorator';
import { invokeRebound, specialBinding, type Binding } from './rebind';
import { populateRequestSlots, requestSlotFields, type RequestSlots } from './request-slots';
import { PARAMTYPE, readParamSlots, type ParamSlot } from './reflect/params';
import { reflectRoute, type RouteInfo } from './reflect/route';
import { type FieldDesc, fieldToZod, mergeField, reflectDtoFields } from './reflect/schema';
import { reflectOperation } from './reflect/swagger';
import type { McpRequestLike, McpTool } from './types';

interface Discovered {
  instance: object;
  classRef: Type<unknown>;
  method: (...args: unknown[]) => unknown;
  methodName: string;
  mcp: McpMetadata;
}

interface BuiltInput {
  shape: Record<string, z.ZodType>;
  bindings: Binding[];
  /** True when a whole-body param reflected no fields, so the schema must allow extra keys. */
  passthrough: boolean;
}

interface Reflected {
  route: RouteInfo;
  base: string;
  description?: string;
  baseShape: Record<string, z.ZodType>;
  bindings: Binding[];
  guards: ReturnType<typeof collectGuards>;
  requestSlots: RequestSlots;
  passthrough: boolean;
}

export interface DiscoverOptions {
  globalGuards?: Type<CanActivate>[];
  defaultResult?: 'json' | 'smart';
}

/** PascalCase a `Base.method` name into a tool name, e.g. `Session.findOne` -> `SessionFindOne`. */
function pascalCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

@Injectable()
export class McpDiscovery {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    private readonly appConfig: ApplicationConfig,
  ) {}

  /**
   * Walk every Nest provider/controller, find methods annotated with `@Mcp`,
   * and build an {@link McpTool} per decorated method. The input schema is
   * reflected from the route + parameter decorators; `run` re-binds the
   * validated input back into the method's positional arguments (with
   * `@UseGuards` guards applied first).
   */
  discover(options: DiscoverOptions = {}): McpTool[] {
    const discovered: Discovered[] = [];
    for (const wrapper of this.discovery.getProviders().concat(this.discovery.getControllers())) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') {
        continue;
      }
      const proto = Object.getPrototypeOf(instance) as object | null;
      if (!proto) {
        continue;
      }
      const classRef = (instance as object).constructor as Type<unknown>;
      for (const methodName of this.scanner.getAllMethodNames(proto)) {
        const method = (proto as Record<string, unknown>)[methodName] as ((...args: unknown[]) => unknown) | undefined;
        if (typeof method !== 'function') {
          continue;
        }
        const mcp = this.reflector.get<McpMetadata>(MCP_METADATA, method);
        if (!mcp) {
          continue;
        }
        discovered.push({ instance, classRef, method, methodName, mcp });
      }
    }

    const globalGuards = options.globalGuards ?? [];
    return discovered.map(d => this.toTool(d, this.reflect(d), globalGuards, options.defaultResult));
  }

  /** Compute the per-method reflection. */
  private reflect(d: Discovered): Reflected {
    const proto = Object.getPrototypeOf(d.instance) as object;
    const route = reflectRoute(d.classRef, d.method);
    const slots = readParamSlots(d.classRef, d.methodName, proto);
    const operation = reflectOperation(d.method);

    const { shape, bindings, passthrough } = buildInput(proto, d.methodName, route.pathParams, slots, operation.params);

    return {
      route,
      base: d.classRef.name.replace(/Controller$/, ''),
      description: operation.description,
      baseShape: shape,
      bindings,
      guards: collectGuards(this.reflector, d.classRef, d.method),
      requestSlots: requestSlotFields(bindings),
      passthrough,
    };
  }

  /** Synthesize the {@link McpTool} for a discovered method. */
  private toTool(
    d: Discovered,
    shared: Reflected,
    globalGuards: Type<CanActivate>[],
    defaultResult?: 'json' | 'smart',
  ): McpTool {
    const meta = d.mcp;
    const inputShape = { ...shared.baseShape, ...overrideShape(meta.input) };
    const name = meta.name ?? pascalCase(`${shared.base}.${d.methodName}`);
    const description =
      meta.description ?? shared.description ?? `${d.methodName} (${shared.route.method} /${shared.route.path})`;
    const applyParamPipes = meta.pipes !== 'skip';
    const { method, instance } = d;
    const { bindings, guards, requestSlots } = shared;
    const { moduleRef, reflector, appConfig } = this;
    const { classRef } = d;

    const run = async (input: Record<string, unknown>, request: McpRequestLike | undefined): Promise<unknown> => {
      // Resolved at call time - APP_GUARD instances aren't populated until
      // app.init() finishes. Globals run before the route/class guards.
      const all = [...collectGlobalGuards(appConfig, globalGuards), ...guards];
      const hasRequest = request != null;
      const guardRequest = hasRequest ? request : { headers: {}, params: {}, query: {}, body: {} };
      // Route the validated input into the request slots a REST guard would read.
      populateRequestSlots(guardRequest, requestSlots, input);
      if (all.length > 0) {
        await runGuards(all, moduleRef, reflector, classRef, method, guardRequest, null, hasRequest ? 'http' : 'rpc');
      }
      const result = await invokeRebound(method, instance, input, bindings, guardRequest, undefined, applyParamPipes);
      return result ?? {};
    };

    return {
      name,
      description,
      inputShape,
      passthrough: shared.passthrough,
      disposition: meta.result ?? defaultResult,
      run,
    };
  }
}

/**
 * Normalise an `@Mcp({ input })` override to a raw Zod shape. Accepts a plain
 * `Record<string, ZodType>` or a whole `z.object({ ... })` (duck-typed by
 * `safeParse` + `shape`, so a different zod copy's object still unwraps).
 */
function overrideShape(input: McpMetadata['input']): Record<string, z.ZodType> {
  if (!input) {
    return {};
  }
  const maybe = input as { safeParse?: unknown; shape?: unknown };
  if (typeof maybe.safeParse === 'function' && maybe.shape != null && typeof maybe.shape === 'object') {
    return maybe.shape as Record<string, z.ZodType>;
  }
  return input as Record<string, z.ZodType>;
}

/** Build the merged Zod input shape and the per-argument re-bind plan. */
function buildInput(
  proto: object,
  methodName: string,
  pathParams: string[],
  slots: ParamSlot[],
  operationParams: Record<string, FieldDesc>,
): BuiltInput {
  const designTypes = (Reflect.getMetadata('design:paramtypes', proto, methodName) as unknown[] | undefined) ?? [];
  const fields: Record<string, FieldDesc> = {};
  const maxIndex = slots.reduce((m, s) => Math.max(m, s.index), -1);
  const bindings: Binding[] = Array.from({ length: maxIndex + 1 }, () => ({ kind: 'missing' as const }));

  const addField = (name: string, desc: FieldDesc): void => {
    fields[name] = name in fields ? mergeField(fields[name], desc) : desc;
  };

  for (const slot of slots) {
    const { binding, fields: contributed } = contributeSlot(slot, pathParams, designTypes);
    bindings[slot.index] = binding;
    for (const [name, desc] of Object.entries(contributed)) {
      addField(name, desc);
    }
  }

  // Layer operation-level (`@ApiParam`/`@ApiQuery`) metadata over the structural
  // fields (later sources win per field).
  for (const [name, desc] of Object.entries(operationParams)) {
    if (name in fields) {
      fields[name] = mergeField(fields[name], desc);
    }
  }

  const shape: Record<string, z.ZodType> = {};
  for (const [name, desc] of Object.entries(fields)) {
    shape[name] = fieldToZod(desc);
  }

  // A passthrough whole-body param binds every input key not owned by another
  // slot, so record those reserved (named) keys on it.
  const reserved = Object.keys(fields);
  let passthrough = false;
  for (const b of bindings) {
    if (b.kind === 'object' && b.passthrough) {
      b.reserved = reserved;
      passthrough = true;
    }
  }

  return { shape, bindings, passthrough };
}

function designTypeAt(designTypes: unknown[], index: number): FieldDesc {
  const ctor = designTypes[index];
  if (ctor === String) {
    return { type: 'string' };
  }
  if (ctor === Number) {
    return { type: 'number' };
  }
  if (ctor === Boolean) {
    return { type: 'boolean' };
  }
  return {};
}

interface SlotContribution {
  binding: Binding;
  fields: Record<string, FieldDesc>;
}

/** A `@Param('id')` scalar or a bare `@Param()` covering all path params. */
function paramContribution(slot: ParamSlot, pathParams: string[]): SlotContribution {
  if (slot.data) {
    return {
      binding: { kind: 'value', field: slot.data, source: 'path', metatype: slot.designType, pipes: slot.pipes },
      fields: { [slot.data]: { type: 'string', required: true } },
    };
  }
  const fields: Record<string, FieldDesc> = {};
  for (const p of pathParams) {
    fields[p] = { type: 'string', required: true };
  }
  return { binding: { kind: 'params', fields: pathParams }, fields };
}

/** A `@Query('x')`/`@Body('x')` scalar or a whole-DTO `@Query()`/`@Body()`. */
function bodyOrQueryContribution(
  slot: ParamSlot,
  source: 'query' | 'body',
  requiredScalar: boolean,
  designTypes: unknown[],
): SlotContribution {
  if (slot.data) {
    return {
      binding: { kind: 'value', field: slot.data, source, metatype: slot.designType, pipes: slot.pipes },
      fields: { [slot.data]: mergeField(designTypeAt(designTypes, slot.index), { required: requiredScalar }) },
    };
  }
  const dtoFields = reflectDtoFields(slot.designType);
  const names = Object.keys(dtoFields);
  // A whole-DTO param whose type erased to `Object`/`Array` (an interface, inline
  // type, or intersection) reflects no fields. Bind it as a passthrough so the
  // client can still send the body and it isn't stripped by the empty schema.
  const passthrough = names.length === 0;
  return {
    binding: { kind: 'object', source, fields: names, passthrough, metatype: slot.designType, pipes: slot.pipes },
    fields: dtoFields,
  };
}

/** Map one parameter slot to its input-field contribution and re-bind instruction. */
function contributeSlot(slot: ParamSlot, pathParams: string[], designTypes: unknown[]): SlotContribution {
  switch (slot.paramtype) {
    case PARAMTYPE.PARAM:
      return paramContribution(slot, pathParams);
    case PARAMTYPE.QUERY:
      return bodyOrQueryContribution(slot, 'query', false, designTypes);
    case PARAMTYPE.BODY:
      return bodyOrQueryContribution(slot, 'body', true, designTypes);
    default:
      return { binding: specialBinding(slot.paramtype, slot.data) ?? { kind: 'missing' }, fields: {} };
  }
}
