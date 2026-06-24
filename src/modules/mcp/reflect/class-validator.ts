/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import * as classValidator from 'class-validator';

export interface ValidationMeta {
  /** `ValidationTypes` discriminator (e.g. `customValidation`, `conditionalValidation`). */
  type?: string;
  /** Validator name - the actionable identity for built-ins (`isString`, `minLength`, ...). */
  name?: string;
  constraints?: unknown[];
}

/**
 * Read `class-validator` metadata for a DTO class, grouped by property name.
 * Returns an empty map when the class carries no validation decorators, so
 * callers degrade gracefully to swagger / `design:type` reflection.
 */
export function classValidatorMetas(dtoType: any): Record<string, ValidationMeta[]> {
  const getStorage = (classValidator as any)?.getMetadataStorage;
  if (typeof getStorage !== 'function') {
    return {};
  }
  let metas: Array<{ propertyName?: string; type?: string; name?: string; constraints?: unknown[] }>;
  try {
    metas = getStorage().getTargetValidationMetadatas(dtoType, null, false, false);
  } catch {
    return {};
  }
  const out: Record<string, ValidationMeta[]> = {};
  for (const m of metas) {
    if (!m.propertyName) {
      continue;
    }
    (out[m.propertyName] ??= []).push({ type: m.type, name: m.name, constraints: m.constraints });
  }
  return out;
}
