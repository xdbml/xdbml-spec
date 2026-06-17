/**
 * Cardinality model + parsing.
 *
 * Extracted verbatim from the playground's RefLine.vue / EdgeLine.vue so
 * the renderer is the single source of truth for how a Ref operator or an
 * explicit `[min..max]` setting maps to a crow's-foot glyph. Pure: no DOM,
 * no framework.
 */

export interface Cardinality {
  min: 0 | 1;
  max: 1 | '*';
}

export const DEFAULT_CARDINALITY: Cardinality = { min: 1, max: 1 };

/**
 * Parse an explicit cardinality string such as `0..*` or `1..1`. Anything
 * that doesn't match the `min..max` shape falls back to the default
 * (exactly one).
 */
export function parseCardinality (s: string | undefined): Cardinality {
  if (!s) return DEFAULT_CARDINALITY;
  const m = s.match(/^(\d+|\*)\.\.(\d+|\*)$/);
  if (!m) return DEFAULT_CARDINALITY;
  const [, minRaw, maxRaw] = m;
  const min: 0 | 1 = minRaw === '0' ? 0 : 1;
  const max: 1 | '*' = (maxRaw === '*' || (Number(maxRaw) > 1)) ? '*' : 1;
  return { min, max };
}

/**
 * Infer endpoint cardinality from a relationship operator when no explicit
 * cardinality string is supplied. `>` is many-to-one, `<` one-to-many,
 * `-` one-to-one, `<>` many-to-many.
 */
export function cardinalityFromOperator (op: string, side: 'source' | 'target'): Cardinality {
  switch (op) {
    case '>':
      return side === 'source' ? { min: 1, max: '*' } : { min: 1, max: 1 };
    case '<':
      return side === 'source' ? { min: 1, max: 1 } : { min: 1, max: '*' };
    case '-':
      return { min: 1, max: 1 };
    case '<>':
      return { min: 1, max: '*' };
    default:
      return DEFAULT_CARDINALITY;
  }
}
