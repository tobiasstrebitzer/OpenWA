import {
  WebhookFilters,
  WebhookFilterCondition,
  FieldDefinition,
  MAX_REGEX_LENGTH,
  MAX_REGEX_INPUT_LENGTH,
  eventFamily,
  getFieldDefinition,
} from './filter-types';

// Compare JID-like ids by their bare user part so a filter written as a plain number or in any
// engine dialect (@c.us / @s.whatsapp.net / @lid, with an optional :device suffix) matches the
// same contact. Note: a raw @lid whose user part is the lid (not the phone) still won't match a
// phone-based filter - that needs adapter-side lid->phone resolution, handled in the engine layer.
const normalizeJid = (value: string): string => value.trim().toLowerCase().split('@')[0].split(':')[0];

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function safeRegexTest(pattern: string, input: string, caseSensitive: boolean): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;
  const text = input.length > MAX_REGEX_INPUT_LENGTH ? input.slice(0, MAX_REGEX_INPUT_LENGTH) : input;
  try {
    return new RegExp(pattern, caseSensitive ? '' : 'i').test(text);
  } catch {
    return false;
  }
}

function evaluateCondition(
  def: FieldDefinition,
  condition: WebhookFilterCondition,
  data: Record<string, unknown>,
): boolean {
  const { operator, value, caseSensitive = false } = condition;
  const resolved = def.resolve(data);

  switch (def.kind) {
    case 'id':
    case 'enum': {
      const candidates = toStringArray(value);
      const actual = typeof resolved === 'string' ? resolved : undefined;
      const normalize = def.kind === 'id' ? normalizeJid : (s: string): string => s;
      const set = new Set(candidates.map(normalize));
      const isMatch = actual != null && set.has(normalize(actual));
      return operator === 'isNot' ? !isMatch : isMatch;
    }

    case 'idArray': {
      const candidates = new Set(toStringArray(value).map(normalizeJid));
      const actual = toStringArray(resolved).map(normalizeJid);
      const intersects = actual.some(v => candidates.has(v));
      return operator === 'isNot' ? !intersects : intersects;
    }

    case 'boolean':
      return resolved === (value === true);

    case 'text': {
      if (typeof value !== 'string') return true; // malformed; validated on save
      const haystackRaw = typeof resolved === 'string' ? resolved : '';
      const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase();
      const needle = caseSensitive ? value : value.toLowerCase();
      if (operator === 'equals') return haystack === needle;
      if (operator === 'matches') return safeRegexTest(value, haystackRaw, caseSensitive);
      return haystack.includes(needle); // contains
    }

    default:
      return true;
  }
}

/**
 * Returns true when the webhook should fire for this event. Absent or empty filters
 * always pass (additive/optional). All conditions must match (AND). Conditions whose
 * field is not registered for the fired event's family are skipped.
 */
export function evaluateFilters(
  filters: WebhookFilters | null | undefined,
  event: string,
  data: Record<string, unknown>,
): boolean {
  if (!filters || !Array.isArray(filters.conditions) || filters.conditions.length === 0) {
    return true;
  }
  const family = eventFamily(event);
  for (const condition of filters.conditions) {
    const def = getFieldDefinition(family, condition.field);
    if (!def) continue;
    if (!evaluateCondition(def, condition, data)) return false;
  }
  return true;
}
