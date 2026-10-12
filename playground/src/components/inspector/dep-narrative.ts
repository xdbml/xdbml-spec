/**
 * A Dep read back as sentences (spec §27.1), for the inspector: one
 * sentence per downstream element, naming the elements as the document
 * writes them, whatever the arrow and wherever the boxes stand on the
 * canvas.
 *
 *   `fct_orders.revenue` is computed from `stg_orders.revenue`.
 *   `stg_customers.full_name` is computed from `raw.customers.first_name` and `raw.customers.last_name`.
 *   The rows of `fct_orders` are computed from the rows of `stg_orders`.
 *   `daily_kpis.order_count` is computed from the rows of `stg_orders`.
 *   The rows of `order_lines` are computed from `orders.line_items`.
 *   The rows of `snapshots` are computed from its own previous rows.
 *
 * An end is a field or an element by name resolution (`resolveLineage`);
 * an end that names nothing reads as written.
 */
import { pathToString } from '@xdbml/parse';
import type { DepEnd, Lineage, ResolvedDependency, Setting } from '@xdbml/parse';

/** A run of a sentence: plain text, or a name set as code. */
export interface NarrativePart {
  text: string;
  code?: true;
}

export interface NarrativeGroup {
  sentence: NarrativePart[];
  /** How many dependencies the sentence states. */
  size: number;
  /** The dependencies of the group that carry settings of their own (§27.2). */
  withSettings: Array<{ index: number; upstream: string; settings: Setting[] }>;
}

const plain = (text: string): NarrativePart => ({ text });
const code = (text: string): NarrativePart => ({ text, code: true });

function key (end: DepEnd | undefined, written: string): string {
  return end ? `${end.element}\u0000${end.field ?? ''}` : `?${written}`;
}

/** `the rows of x` for an entity or a View, `x` for a field or an end that names nothing. */
function term (end: DepEnd | undefined, written: string): NarrativePart[] {
  return end && end.field === undefined ? [plain('the rows of '), code(written)] : [code(written)];
}

/** `a`, `a and b`, `a, b, and c`. */
function list (items: NarrativePart[][]): NarrativePart[] {
  const out: NarrativePart[] = [];
  items.forEach((item, k) => {
    if (k > 0) out.push(plain(items.length === 2 ? ' and ' : k === items.length - 1 ? ', and ' : ', '));
    out.push(...item);
  });
  return out;
}

export function depNarrative (lineage: Lineage, resolved: ReadonlyArray<ResolvedDependency> = []): NarrativeGroup[] {
  const groups = new Map<string, {
    down: DepEnd | undefined;
    written: string;
    ups: Array<{ end: DepEnd | undefined; written: string }>;
    withSettings: NarrativeGroup['withSettings'];
  }>();
  lineage.dependencies.forEach((d, index) => {
    const ends = resolved[index] ?? {};
    const downWritten = pathToString(d.downstream.path);
    const upWritten = pathToString(d.upstream.path);
    const k = key(ends.downstream, downWritten);
    let g = groups.get(k);
    if (!g) {
      g = { down: ends.downstream, written: downWritten, ups: [], withSettings: [] };
      groups.set(k, g);
    }
    g.ups.push({ end: ends.upstream, written: upWritten });
    if (d.settings.length > 0) g.withSettings.push({ index, upstream: upWritten, settings: d.settings });
  });

  return [...groups.values()].map((g) => {
    const rows = g.down !== undefined && g.down.field === undefined;
    const self = rows && g.ups.length === 1 && key(g.ups[0].end, g.ups[0].written) === key(g.down, g.written);
    const sentence: NarrativePart[] = rows
      ? [plain('The rows of '), code(g.written), plain(' are computed from ')]
      : [code(g.written), plain(' is computed from ')];
    if (self) sentence.push(plain('its own previous rows'));
    else sentence.push(...list(g.ups.map((u) => term(u.end, u.written))));
    sentence.push(plain('.'));
    return { sentence, size: g.ups.length, withSettings: g.withSettings };
  });
}
