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
  /**
   * Undefined when the maximum is unstated: an end of a relationship between
   * entities that a `?` marks optional and nothing else qualifies (spec
   * §11.16.1, v0.7). The glyph then shows the ring alone.
   */
  max?: 1 | '*';
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
 * The glyph for one end from the cardinality @xdbml/parse states for it
 * (`refCardinality`, spec §11.7, §11.8): a minimum of 0 draws the ring, a
 * maximum of 1 the bar, and any larger maximum the crow's foot. Undefined
 * when the end shows nothing: no bound stated, or a minimum of 1 without a
 * maximum.
 */
export function cardinalityFromEnd (end: { min?: number; max?: number | '*' } | undefined): Cardinality | undefined {
  if (!end) return undefined;
  const max = end.max === undefined ? undefined : (end.max === '*' || end.max > 1 ? '*' : 1);
  if (end.min === 0) return max === undefined ? { min: 0 } : { min: 0, max };
  return max === undefined ? undefined : { min: 1, max };
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
