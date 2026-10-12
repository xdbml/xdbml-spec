/**
 * Markdown for notes (spec §19.6, v0.7).
 *
 * The text of a sticky note is Markdown. This module reads the subset a
 * note needs into blocks and inline runs, with no dependency and no HTML:
 * the renderer lays the runs out as SVG text, and the playground's
 * inspector builds elements from the same blocks, so neither injects markup
 * from the document.
 *
 * Blocks: ATX headings (`#` to `######`), paragraphs, bulleted lists (`-`,
 * `*`, `+`) and numbered lists (`1.` or `1)`), nested by indentation, block
 * quotes (`>`), fenced code blocks (``` or ~~~), and thematic breaks (`---`,
 * `***`, `___`). A paragraph joins its lines with a space, as CommonMark
 * does; a line ending in two spaces or a backslash breaks the line.
 *
 * Inline: `**strong**` and `__strong__`, `*emphasis*` and `_emphasis_`,
 * `~~strikethrough~~`, `` `code` ``, `[text](url)`, `<https://...>`, and
 * `![alt](url)`, shown as its alt text. A backslash escapes a punctuation
 * character.
 *
 * Anything else, a table or HTML for instance, stays as written: a line that
 * starts with `|` or `<` keeps its own line, in a block of its own.
 */

export interface MdRun {
  text: string;
  strong?: boolean;
  em?: boolean;
  strike?: boolean;
  code?: boolean;
  /** The target of a link; the run is the link's text. */
  href?: string;
}

/** A line break inside a paragraph, from two trailing spaces or a backslash. */
export interface MdBreak { break: true }

export type MdInline = MdRun | MdBreak;

export type MdBlock =
  | { kind: 'heading'; level: number; inlines: MdInline[] }
  | { kind: 'paragraph'; inlines: MdInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { kind: 'quote'; blocks: MdBlock[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'rule' }
  /** Lines shown as written: a table, HTML. */
  | { kind: 'verbatim'; lines: string[] };

export function isBreak (i: MdInline): i is MdBreak {
  return (i as MdBreak).break === true;
}

/* ----------------------------------------------------------------- blocks */

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const BULLET = /^( {0,3})([-*+])([ \t]+|$)(.*)$/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)(.*)$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const VERBATIM = /^ {0,3}[|<]/;

/** Read the Markdown text of a note into blocks. */
export function parseMarkdown (text: string): MdBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseBlocks(lines);
}

function indentOf (line: string): number {
  const m = /^ */.exec(line);
  return m ? m[0].length : 0;
}

function parseBlocks (lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  let para: string[] = [];
  const flush = (): void => {
    if (para.length > 0) blocks.push({ kind: 'paragraph', inlines: parseInlineLines(para) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1];
      const indent = indentOf(line);
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`).test(lines[i])) {
        code.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))));
        i++;
      }
      i++; // the closing fence, or the end of the text
      blocks.push({ kind: 'code', lines: code });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, inlines: parseInline(heading[2] ?? '') });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && (QUOTE.test(lines[i]) || inner.length > 0)) {
        const q = QUOTE.exec(lines[i]);
        if (!q && (BULLET.test(lines[i]) || ORDERED.test(lines[i]) || HEADING.test(lines[i]))) break;
        inner.push(q ? q[1] : lines[i]);
        i++;
      }
      blocks.push({ kind: 'quote', blocks: parseBlocks(inner) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flush();
      const isOrdered = !!ordered;
      const start = ordered ? Number(ordered[2]) : 1;
      const items: MdBlock[][] = [];
      while (i < lines.length) {
        const b = BULLET.exec(lines[i]);
        const o = b ? null : ORDERED.exec(lines[i]);
        if (!(isOrdered ? o : b)) break;
        const markerWidth = isOrdered
          ? o![1].length + o![2].length + 1 + Math.max(1, o![4].length)
          : b![1].length + 1 + Math.max(1, b![3].length);
        const itemLines = [isOrdered ? o![5] : b![4]];
        i++;
        // Continuation: lines indented under the item, and blank lines
        // followed by such lines.
        while (i < lines.length) {
          const next = lines[i];
          if (next.trim() === '') {
            const after = lines.slice(i + 1).find((l) => l.trim() !== '');
            if (after !== undefined && indentOf(after) >= markerWidth) {
              itemLines.push('');
              i++;
              continue;
            }
            break;
          }
          const ind = indentOf(next);
          const sibling = (isOrdered ? ORDERED.test(next) : BULLET.test(next)) && ind < markerWidth;
          if (ind >= Math.min(markerWidth, 2) && !sibling) {
            itemLines.push(next.slice(Math.min(markerWidth, ind)));
            i++;
            continue;
          }
          // A lazy continuation line of the item's paragraph.
          if (!BULLET.test(next) && !ORDERED.test(next) && !HEADING.test(next) && !RULE.test(next)
            && !QUOTE.test(next) && !FENCE.test(next) && itemLines[itemLines.length - 1].trim() !== '') {
            itemLines.push(next.trim());
            i++;
            continue;
          }
          break;
        }
        items.push(parseBlocks(itemLines));
      }
      blocks.push({ kind: 'list', ordered: isOrdered, start, items });
      continue;
    }

    if (VERBATIM.test(line) && para.length === 0) {
      const raw: string[] = [];
      while (i < lines.length && VERBATIM.test(lines[i])) {
        raw.push(lines[i].trim());
        i++;
      }
      blocks.push({ kind: 'verbatim', lines: raw });
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return blocks;
}

/* ----------------------------------------------------------------- inline */

/** The lines of a paragraph, joined with spaces, with hard breaks where a line asks for one. */
function parseInlineLines (lines: string[]): MdInline[] {
  const out: MdInline[] = [];
  lines.forEach((raw, k) => {
    const last = k === lines.length - 1;
    const hard = !last && (/ {2,}$/.test(raw) || /\\$/.test(raw));
    const text = raw.trim().replace(/\\$/, '');
    out.push(...parseInline(text));
    if (!last) out.push(hard ? { break: true } : { text: ' ' });
  });
  return mergeRuns(out);
}

const ESCAPABLE = '\\`*_{}[]()#+-.!|~<>"\'';

interface Style { strong: boolean; em: boolean; strike: boolean }

/** Read inline Markdown into runs. */
export function parseInline (text: string): MdRun[] {
  const out: MdRun[] = [];
  parseInto(text, { strong: false, em: false, strike: false }, out);
  return mergeRuns(out) as MdRun[];
}

function push (out: MdRun[], text: string, style: Style, extra: Partial<MdRun> = {}): void {
  if (text === '') return;
  const run: MdRun = { text };
  if (style.strong) run.strong = true;
  if (style.em) run.em = true;
  if (style.strike) run.strike = true;
  Object.assign(run, extra);
  out.push(run);
}

function parseInto (text: string, style: Style, out: MdRun[]): void {
  let buf = '';
  let i = 0;
  const flush = (): void => { push(out, buf, style); buf = ''; };
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      const m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(text.slice(i));
      if (m) {
        flush();
        const inner = m[2].replace(/^ (.*) $/, '$1');
        push(out, inner, style, { code: true });
        i += m[0].length;
        continue;
      }
    }
    if (c === '!' && text[i + 1] === '[') {
      const link = readLink(text, i + 1);
      if (link) {
        flush();
        push(out, link.label, { ...style, em: true });
        i = link.end;
        continue;
      }
    }
    if (c === '[') {
      const link = readLink(text, i);
      if (link) {
        flush();
        const inner: MdRun[] = [];
        parseInto(link.label, style, inner);
        for (const r of inner) out.push({ ...r, href: link.href });
        i = link.end;
        continue;
      }
    }
    if (c === '<') {
      const m = /^<((?:https?|mailto|ftp):[^\s<>]+)>/i.exec(text.slice(i));
      if (m) {
        flush();
        push(out, m[1], style, { href: m[1] });
        i += m[0].length;
        continue;
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      const span = readEmphasis(text, i);
      if (span) {
        flush();
        const next: Style = { ...style };
        if (span.kind === 'strong') next.strong = true;
        else if (span.kind === 'em') next.em = true;
        else if (span.kind === 'both') { next.strong = true; next.em = true; } else next.strike = true;
        parseInto(span.inner, next, out);
        i = span.end;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
}

function readLink (text: string, at: number): { label: string; href: string; end: number } | undefined {
  // `[label](href)`, with brackets balanced in the label.
  let depth = 0;
  let j = at;
  for (; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (text[j] === '[') depth++;
    else if (text[j] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (j >= text.length || text[j + 1] !== '(') return undefined;
  const close = text.indexOf(')', j + 2);
  if (close < 0) return undefined;
  const target = text.slice(j + 2, close).trim().replace(/\s+"[^"]*"$/, '').replace(/^<(.*)>$/, '$1');
  return { label: text.slice(at + 1, j), href: target, end: close + 1 };
}

function readEmphasis (text: string, at: number): { kind: 'strong' | 'em' | 'both' | 'strike'; inner: string; end: number } | undefined {
  const c = text[at];
  let n = 1;
  while (text[at + n] === c) n++;
  if (c === '~') {
    if (n !== 2) return undefined;
  } else if (n > 3) {
    return undefined;
  }
  const open = text.slice(at, at + n);
  const after = text[at + n];
  if (after === undefined || /\s/.test(after)) return undefined;
  // An underscore inside a word stays an underscore (snake_case).
  if (c === '_' && at > 0 && /[A-Za-z0-9]/.test(text[at - 1])) return undefined;
  let k = at + n;
  while (k < text.length) {
    const idx = text.indexOf(open, k);
    if (idx < 0) return undefined;
    const before = text[idx - 1];
    const follow = text[idx + n];
    const closesWord = c !== '_' || follow === undefined || !/[A-Za-z0-9]/.test(follow);
    if (idx > at + n && before !== undefined && !/\s/.test(before) && before !== '\\' && follow !== c && closesWord) {
      const kind = c === '~' ? 'strike' : n === 3 ? 'both' : n === 2 ? 'strong' : 'em';
      return { kind, inner: text.slice(at + n, idx), end: idx + n };
    }
    k = idx + 1;
  }
  return undefined;
}

/** Join neighboring runs of one style, so a renderer measures and draws fewer pieces. */
function mergeRuns (inlines: MdInline[]): MdInline[] {
  const out: MdInline[] = [];
  for (const r of inlines) {
    const prev = out[out.length - 1];
    if (prev && !isBreak(prev) && !isBreak(r)
      && !!prev.strong === !!r.strong && !!prev.em === !!r.em && !!prev.strike === !!r.strike
      && !!prev.code === !!r.code && prev.href === r.href) {
      prev.text += r.text;
    } else {
      out.push(isBreak(r) ? r : { ...r });
    }
  }
  return out;
}

/** The plain text of inline runs, for a title or an accessible label. */
export function inlineText (inlines: ReadonlyArray<MdInline>): string {
  return inlines.map((i) => (isBreak(i) ? '\n' : i.text)).join('');
}
