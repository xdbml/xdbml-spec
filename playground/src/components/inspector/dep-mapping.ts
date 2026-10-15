/**
 * Source-to-target mapping in the inspector (spec §27.10, v0.7.2).
 *
 * `depMapping()` reads a Dep whose dependencies carry a kind of
 * transformation as the rows of a mapping: one row per line into a field,
 * with the field, its sources and the kind, then one row per line into the
 * target entity or View, which steers the rows it receives (a lookup, a
 * join, a filter, a grouping). A Dep without any kind keeps its sentences
 * (dep-narrative.ts).
 *
 * `mappingsInto()` reads the same from the side of a target: the Deps with
 * transformations that load it, the fields none of the document's Deps
 * feeds (§27.10.4), and, for a View that is not materialized, its metrics
 * with the fields each one aggregates (§27.11).
 */
import { collectLineage, pathToString, resolveLineage, targetCoverage } from '@xdbml/parse';
import type { Lineage, ResolvedDependency, Setting, Transformation, XDbmlDocument } from '@xdbml/parse';

export interface MappingRow {
  /** The field the line loads, inside the target; for a row rule, the target as written. */
  target: string;
  /** The upstream ends, as written. */
  sources: string[];
  kind?: Transformation;
  note?: string;
  /** The settings of the line other than its note and its kind. */
  settings: Setting[];
}

export interface DepMapping {
  /** The target entity or View, as name resolution gives it, or as written. */
  element: string;
  /** Lines into a field of the target. */
  fields: MappingRow[];
  /** Lines into the target as a whole: the rows it receives. */
  rows: MappingRow[];
}

/** Whether a Dep reads as a mapping: one of its dependencies carries a kind. */
export function isMapping (lineage: Lineage): boolean {
  return lineage.dependencies.some((d) => d.transformation !== undefined);
}

export function depMapping (lineage: Lineage, resolved: ReadonlyArray<ResolvedDependency> = []): DepMapping {
  const out: DepMapping = { element: '', fields: [], rows: [] };
  const byLine = new Map<unknown, MappingRow>();
  lineage.dependencies.forEach((d, index) => {
    const key = d.line ?? index;
    const upstream = pathToString(d.upstream.path);
    const existing = byLine.get(key);
    if (existing) {
      existing.sources.push(upstream);
      return;
    }
    const down = resolved[index]?.downstream;
    const written = pathToString(d.downstream.path);
    if (!out.element) out.element = down?.element ?? written;
    const note = d.settings.find((s) => s.name === 'note');
    const row: MappingRow = {
      target: down?.field ?? written,
      sources: [upstream],
      ...(d.transformation ? { kind: d.transformation } : {}),
      ...(note?.value?.kind === 'StringValue' ? { note: note.value.value } : {}),
      settings: d.settings.filter((s) => s.name !== 'note' && s.name !== 'transformation'),
    };
    byLine.set(key, row);
    // An end that names nothing counts as a field, the more common case.
    const toField = down ? down.field !== undefined : true;
    (toField ? out.fields : out.rows).push(row);
  });
  return out;
}

export interface TargetMappings {
  /** The Deps with transformations whose target is the element. */
  deps: Array<{ id: string; name?: string }>;
  /** The fields no dependency of the document feeds (§27.10.4). */
  unfed: string[];
  /** For a View that is not materialized: each field an aggregation feeds, with its sources (§27.11). */
  metrics: Array<{ field: string; sources: string[] }>;
}

/**
 * The mappings into an entity or a View, by its qualified name as name
 * resolution gives it. Empty when no Dep with transformations loads it.
 */
export function mappingsInto (doc: XDbmlDocument, element: string, notMaterializedView = false): TargetMappings {
  const out: TargetMappings = { deps: [], unfed: [], metrics: [] };
  const resolved = resolveLineage(doc);
  const metrics = new Map<string, string[]>();
  for (const l of collectLineage(doc)) {
    const ends = resolved.get(l.id) ?? [];
    const into = l.dependencies.some((_, i) => ends[i]?.downstream?.element === element);
    if (!into || !isMapping(l)) continue;
    out.deps.push({ id: l.id, ...(l.name !== undefined ? { name: l.name } : {}) });
    l.dependencies.forEach((d, i) => {
      const down = ends[i]?.downstream;
      if (!notMaterializedView || d.transformation !== 'aggregation' || down?.element !== element || down.field === undefined) return;
      const list = metrics.get(down.field) ?? [];
      list.push(pathToString(d.upstream.path));
      metrics.set(down.field, list);
    });
  }
  if (out.deps.length === 0) return out;
  out.unfed = targetCoverage(doc, element)?.unfed ?? [];
  out.metrics = [...metrics].map(([field, sources]) => ({ field, sources }));
  return out;
}
