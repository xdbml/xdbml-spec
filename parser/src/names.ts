/**
 * Qualified names (spec §3.2, §20.1).
 *
 * A name in xDBML may be qualified by the names of the levels that hold
 * it: `core.users` is the entity `users` of the Container `core`, and
 * `core.users.email` is a field of that entity. A dot outside double
 * quotes separates two levels; a dot inside double quotes belongs to the
 * name. `"sales"."Work Order"` is the entity `Work Order` of the Container
 * `sales`, and `"my.table"` is one entity named `my.table`.
 *
 * Tools hold a qualified name as one string, so that string has to keep
 * the difference. This module defines its form: the segments joined with
 * dots, a segment that holds a dot or a double quote written in double
 * quotes as in the source, with `\"` and `\\` escapes. Every other segment
 * is written bare, so a name without such characters reads exactly as it
 * did before quoted segments were kept: `sales.Work Order` for
 * `"sales"."Work Order"`, `core.users` for `core.users`, and `"my.table"`
 * for `"my.table"`.
 *
 * The AST holds the names of Containers, entities, Enums, Types, Edges,
 * Views, TablePartials, TableGroups and SupertypeGroups in this form, and
 * the references to them as well. Field names stay as written, since a
 * field name is never split: a path keeps its segments apart
 * (`PathSegment[]`), and only the strings a tool builds from a path,
 * such as the dotted fields of a key, use this form.
 */

/** True when a segment needs quotes to stay one segment. */
function needsQuotes (segment: string): boolean {
  return segment.includes('.') || segment.includes('"');
}

/** One segment of a qualified name, quoted when it holds a dot or a double quote. */
export function quoteNameSegment (segment: string): string {
  if (!needsQuotes(segment)) return segment;
  return `"${segment.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** Join the segments of a qualified name, each as it was written unquoted. */
export function joinName (segments: ReadonlyArray<string>): string {
  return segments.map(quoteNameSegment).join('.');
}

/**
 * Split a qualified name into its segments, unquoted. A dot inside a
 * quoted segment stays in the segment: `splitName('"my.table".id')` is
 * `['my.table', 'id']`, and `splitName('core.users')` is `['core', 'users']`.
 */
export function splitName (name: string): string[] {
  if (!name.includes('"')) return name.split('.');
  const segments: string[] = [];
  let i = 0;
  for (;;) {
    let segment = '';
    if (name[i] === '"') {
      i += 1;
      while (i < name.length && name[i] !== '"') {
        if (name[i] === '\\' && i + 1 < name.length) i += 1;
        segment += name[i];
        i += 1;
      }
      i += 1; // closing quote
      // Anything up to the next dot belongs to the segment as well, so a
      // malformed name never loses characters.
      while (i < name.length && name[i] !== '.') segment += name[i++];
    } else {
      while (i < name.length && name[i] !== '.') segment += name[i++];
    }
    segments.push(segment);
    if (i >= name.length) break;
    i += 1; // the dot
  }
  return segments;
}

/** The last segment of a qualified name, unquoted: `users` for `core.users`. */
export function lastNameSegment (name: string): string {
  const segments = splitName(name);
  return segments[segments.length - 1];
}

/**
 * The qualified name without its last segment, or undefined for a name of
 * one segment: `core` for `core.users`, `"a.b"` for `"a.b".users`.
 */
export function nameQualifier (name: string): string | undefined {
  const segments = splitName(name);
  return segments.length > 1 ? joinName(segments.slice(0, -1)) : undefined;
}

/** True when a name has more than one segment: `core.users`, not `"my.table"`. */
export function isQualifiedName (name: string): boolean {
  return splitName(name).length > 1;
}
