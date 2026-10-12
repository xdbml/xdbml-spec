/**
 * Cardinality at the two ends of a relationship (spec §11.1, §11.7, §11.8,
 * §11.16; v0.7).
 *
 * Three things state it, end by end:
 *
 *   - the operator, `>`, `<`, `-` or `<>`, which gives each end a range on a
 *     relationship between attributes (§11.8), and only a reading direction
 *     on a relationship between entities (§11.16.2);
 *   - a `?` written against the operator, `>?`, `?<`, `?-?`, which makes the
 *     end on its side optional: minimum 0 (§11.1, the DBML form);
 *   - the `source:` and `target:` settings, or their four-key form, which
 *     state a range outright (§11.7).
 *
 * Where none of them makes the parent end optional, a nullable foreign key
 * does: the child may have no parent (§11.8).
 *
 * A `?` and a setting may disagree on an end: `>?` with `target: '1..1'`.
 * In a document that declares an `xdbml:` version the setting applies; in a
 * document without one, which reads as DBML, the `?` applies. Either way the
 * disagreement draws a warning (§11.7).
 */

import type {
  CardinalityOperator,
  RefDeclaration,
  RefSpec,
  RefValue,
  Setting,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { entityNames, isEntityLevelEndpoint, refChildEndpoint } from './relationships.ts';
import { refChildNullable } from './constraints.ts';

/** What stated the cardinality of one end. */
export type CardinalityOrigin =
  /** A `source:` / `target:` setting, or `min_source` and its siblings (§11.7). */
  | 'setting'
  /** The operator alone (§11.8). */
  | 'operator'
  /** A `?` written against the operator (§11.1). */
  | 'optional-mark'
  /** A nullable foreign key at the child end, which makes the parent end optional (§11.8). */
  | 'nullable-foreign-key'
  /** Nothing: an end of a relationship between entities without a `?` or a setting (§11.16.1). */
  | 'unstated';

export interface EndCardinality {
  /** Minimum count, or undefined when unstated. */
  min?: number;
  /** Maximum count, a number or '*', or undefined when unstated. */
  max?: number | '*';
  /** The range as §11.7 writes it, `'0..1'`, when both bounds are stated. */
  text?: string;
  /** What stated the minimum. */
  origin: CardinalityOrigin;
}

export interface RefCardinality {
  source: EndCardinality;
  target: EndCardinality;
  /** The ends where a `?` and a setting disagree (§11.7). */
  conflicts: Array<'source' | 'target'>;
}

export interface RefCardinalityContext {
  /** True when both ends name entities rather than attributes (§11.16). */
  entityLevel?: boolean;
  /**
   * Whether the child end's foreign key may hold null (§11.8). Undefined
   * when unknown, in which case no inference applies.
   */
  childNullable?: boolean;
  /**
   * True when the document declares an `xdbml:` version: a setting then
   * applies over a `?` that disagrees with it. Without one, the `?` applies.
   */
  versioned?: boolean;
}

type Bounds = { min?: number; max?: number | '*' };

/** The ranges of §11.8 for each operator: [source, target]. */
const OPERATOR_RANGES: Record<CardinalityOperator, [Bounds, Bounds]> = {
  '>': [{ min: 1, max: '*' }, { min: 1, max: 1 }],
  '<': [{ min: 1, max: 1 }, { min: 1, max: '*' }],
  '-': [{ min: 1, max: 1 }, { min: 1, max: 1 }],
  '<>': [{ min: 0, max: '*' }, { min: 0, max: '*' }],
};

/** The parent end of each operator: the end a child's foreign key points at. */
const PARENT_END: Record<CardinalityOperator, 'source' | 'target' | undefined> = {
  '>': 'target',
  '-': 'target',
  '<': 'source',
  '<>': undefined,
};

/** The `?` marks of a Ref or an inline `ref:` setting, by end. */
function marks (spec: Pick<RefSpec | RefValue, 'sourceOptional' | 'targetOptional'>): Record<'source' | 'target', boolean> {
  return { source: !!spec.sourceOptional, target: !!spec.targetOptional };
}

function settingString (settings: ReadonlyArray<Setting>, name: string): string | undefined {
  const s = settings.find((x) => x.name === name);
  if (!s || !s.value) return undefined;
  const v = s.value;
  if (v.kind === 'StringValue' || v.kind === 'NumberValue' || v.kind === 'IdentifierValue') return String(v.value);
  return undefined;
}

function parseBound (raw: string | undefined): number | '*' | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (t === '*') return '*';
  return /^\d+$/.test(t) ? Number(t) : undefined;
}

/** The range a setting states for one end: `source: '0..1'`, or `min_source` / `max_source`. */
function settingBounds (settings: ReadonlyArray<Setting>, end: 'source' | 'target'): Bounds | undefined {
  const range = settingString(settings, end);
  if (range !== undefined) {
    const m = /^\s*(\d+|\*)\s*(?:\.\.\s*(\d+|\*)\s*)?$/.exec(range);
    if (m) {
      // As in DBML, '*' alone reads as '1..*', and a single number N as 'N..N'.
      if (m[2] === undefined) return m[1] === '*' ? { min: 1, max: '*' } : { min: Number(m[1]), max: Number(m[1]) };
      return { min: parseBound(m[1]) === '*' ? 0 : Number(m[1]), max: parseBound(m[2]) };
    }
  }
  const min = parseBound(settingString(settings, `min_${end}`));
  const max = parseBound(settingString(settings, `max_${end}`));
  if (min === undefined && max === undefined) return undefined;
  return { min: min === '*' ? undefined : min, max };
}

function finish (b: Bounds, origin: CardinalityOrigin): EndCardinality {
  const out: EndCardinality = { origin };
  if (b.min !== undefined) out.min = b.min;
  if (b.max !== undefined) out.max = b.max;
  if (b.min !== undefined && b.max !== undefined) out.text = `${b.min}..${b.max}`;
  return out;
}

/**
 * The cardinality of each end of a relationship, from its operator, its `?`
 * marks and its settings (spec §11.7, §11.8, §11.16). `settings` is empty
 * for an inline `ref:`, which takes none (§11.9).
 */
export function refCardinality (
  spec: Pick<RefSpec | RefValue, 'operator' | 'sourceOptional' | 'targetOptional'>,
  settings: ReadonlyArray<Setting>,
  ctx: RefCardinalityContext = {},
): RefCardinality {
  const marked = marks(spec);
  const parent = PARENT_END[spec.operator];
  const conflicts: Array<'source' | 'target'> = [];

  const end = (side: 'source' | 'target', i: 0 | 1): EndCardinality => {
    // From the operator and its marks.
    let fromOperator: EndCardinality;
    if (ctx.entityLevel) {
      // §11.16.1: the operator gives direction only; a `?` states the
      // minimum and leaves the maximum unstated.
      fromOperator = marked[side] ? finish({ min: 0 }, 'optional-mark') : finish({}, 'unstated');
    } else {
      const base = OPERATOR_RANGES[spec.operator][i];
      if (marked[side] && base.min !== 0) {
        fromOperator = finish({ min: 0, max: base.max }, 'optional-mark');
      } else if (marked[side]) {
        fromOperator = finish(base, 'operator');
      } else if (side === parent && ctx.childNullable === true) {
        fromOperator = finish({ min: 0, max: base.max }, 'nullable-foreign-key');
      } else {
        fromOperator = finish(base, 'operator');
      }
    }

    const stated = settingBounds(settings, side);
    if (!stated) return fromOperator;
    if (marked[side] && stated.min !== undefined && stated.min > 0) {
      conflicts.push(side);
      if (!ctx.versioned) return fromOperator;
    }
    return finish({
      min: stated.min ?? fromOperator.min,
      max: stated.max ?? fromOperator.max,
    }, 'setting');
  };

  return { source: end('source', 0), target: end('target', 1), conflicts };
}

/**
 * The cardinality of each end of a `Ref` declaration in a document, with
 * the facts the document supplies: whether both ends name entities, and
 * whether the child's foreign key may hold null.
 */
export function refCardinalityIn (doc: XDbmlDocument, ref: RefDeclaration): RefCardinality {
  const names = entityNames(doc);
  const entityLevel = isEntityLevelEndpoint(ref.spec.source, names) && isEntityLevelEndpoint(ref.spec.target, names);
  const child = refChildEndpoint(ref);
  return refCardinality(ref.spec, ref.settings, {
    entityLevel,
    childNullable: entityLevel || !child ? undefined : refChildNullable(doc, child),
    versioned: !!doc.version,
  });
}

/**
 * Spec §11.7: a warning on each end of a `Ref` where a `?` and a setting
 * disagree, naming the reading that applies in this document.
 */
export function checkOptionalMarks (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const versioned = !!doc.version;
  for (const stmt of doc.statements) {
    if (stmt.kind !== 'RefDeclaration') continue;
    const card = refCardinality(stmt.spec, stmt.settings, { versioned });
    for (const side of card.conflicts) {
      const mark = side === 'source' ? `'?${stmt.spec.operator}'` : `'${stmt.spec.operator}?'`;
      diagnostics.push({
        severity: 'warning',
        code: 'cardinality-conflict',
        message:
          `The ${mark} marks the ${side} end optional, and the settings give it a minimum of 1 or more. ` +
          (versioned
            ? `The setting applies, since the document declares an xdbml: version; drop one of the two (spec §11.7).`
            : `The '?' applies, since a document without an xdbml: version reads as DBML; drop one of the two (spec §11.7).`),
        span: stmt.spec.span,
      });
    }
  }
  return diagnostics;
}
