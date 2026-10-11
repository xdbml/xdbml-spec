/**
 * The text of a sticky note, laid out in lines (spec §19.6, v0.7).
 *
 * The Markdown of the note (markdown.ts) is broken into lines that fit the
 * width of the box, with the text metrics of the serializer, so the box the
 * layout sizes holds the lines the serializer draws. Each line keeps its
 * inline runs; the serializer draws a line as one `<text>` whose runs flow
 * as `<tspan>`s, so an estimate that is off by a pixel moves no run onto
 * its neighbor.
 */

import { isBreak, parseMarkdown, type MdBlock, type MdInline } from './markdown.ts';
import { measureMono, measureText } from '../svg/metrics.ts';

/** A piece of a line in one style. */
export interface NoteRun {
  text: string;
  strong?: boolean;
  em?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

export interface NoteLine {
  /** Left edge, from the left of the text area. */
  x: number;
  /** Baseline, from the top of the text area. */
  y: number;
  /** Font size in px. */
  size: number;
  /** 600 for a heading. */
  weight: number;
  runs: NoteRun[];
  /** A line of a code block, in the monospace stack. */
  mono?: boolean;
  /** A line inside a block quote, drawn a little lighter. */
  muted?: boolean;
}

/** What a note draws besides its lines. */
export type NoteMark =
  /** A bullet or a number in front of a list item, its baseline at `y`. */
  | { kind: 'marker'; text: string; x: number; y: number; size: number }
  /** A thematic break. */
  | { kind: 'rule'; x: number; y: number; width: number }
  /** The bar to the left of a block quote. */
  | { kind: 'quote'; x: number; y: number; height: number }
  /** The band behind a code block. */
  | { kind: 'code'; x: number; y: number; width: number; height: number };

export interface NoteText {
  lines: NoteLine[];
  marks: NoteMark[];
  /** Height of the laid-out text. */
  height: number;
}

const BODY = { size: 12, lead: 17 };
const HEADINGS: Record<number, { size: number; lead: number }> = {
  1: { size: 16, lead: 22 },
  2: { size: 14, lead: 20 },
  3: { size: 13, lead: 18 },
};
const CODE = { size: 11, lead: 15, pad: 5 };
const BLOCK_GAP = 6;
const LIST_INDENT = 16;
const QUOTE_INDENT = 11;
/** Ascent of a line: the baseline sits this far below the top of its lead, as a fraction of the size. */
const ASCENT = 0.8;

/** Lay out the Markdown text of a note at the given width. */
export function layoutNoteText (text: string, width: number): NoteText {
  const out: NoteText = { lines: [], marks: [], height: 0 };
  const y = layoutBlocks(parseMarkdown(text), 0, 0, Math.max(40, width), out, false);
  out.height = Math.ceil(y);
  return out;
}

function layoutBlocks (blocks: MdBlock[], x: number, y0: number, width: number, out: NoteText, muted: boolean): number {
  let y = y0;
  blocks.forEach((b, k) => {
    if (k > 0) y += BLOCK_GAP;
    y = layoutBlock(b, x, y, width, out, muted);
  });
  return y;
}

function layoutBlock (b: MdBlock, x: number, y: number, width: number, out: NoteText, muted: boolean): number {
  switch (b.kind) {
    case 'heading': {
      const h = HEADINGS[b.level] ?? HEADINGS[3];
      return flow(b.inlines, x, y, width, h.size, h.lead, 600, out, muted);
    }
    case 'paragraph':
      return flow(b.inlines, x, y, width, BODY.size, BODY.lead, 400, out, muted);
    case 'list': {
      let cy = y;
      b.items.forEach((item, k) => {
        if (k > 0) cy += 2;
        const marker = b.ordered ? `${b.start + k}.` : '•';
        out.marks.push({ kind: 'marker', text: marker, x: x + (b.ordered ? 0 : 4), y: cy + baseline(BODY), size: BODY.size });
        const end = layoutBlocks(item, x + LIST_INDENT, cy, width - LIST_INDENT, out, muted);
        // An empty item still takes a line.
        cy = Math.max(end, cy + BODY.lead);
      });
      return cy;
    }
    case 'quote': {
      const end = layoutBlocks(b.blocks, x + QUOTE_INDENT, y, width - QUOTE_INDENT, out, true);
      out.marks.push({ kind: 'quote', x: x + 2, y: y + 1, height: Math.max(BODY.lead, end - y) - 2 });
      return Math.max(end, y + BODY.lead);
    }
    case 'code': {
      const inner = width - CODE.pad * 2;
      const lines: string[] = [];
      for (const raw of b.lines.length > 0 ? b.lines : ['']) lines.push(...hardWrap(raw, inner));
      const height = lines.length * CODE.lead + CODE.pad * 2;
      out.marks.push({ kind: 'code', x, y, width, height });
      lines.forEach((t, k) => {
        out.lines.push({
          x: x + CODE.pad,
          y: y + CODE.pad + k * CODE.lead + baseline(CODE),
          size: CODE.size,
          weight: 400,
          runs: t === '' ? [] : [{ text: t }],
          mono: true,
          muted,
        });
      });
      return y + height;
    }
    case 'rule':
      out.marks.push({ kind: 'rule', x, y: y + 6, width });
      return y + 12;
    case 'verbatim': {
      let cy = y;
      for (const raw of b.lines) cy = flow([{ text: raw }], x, cy, width, BODY.size, BODY.lead, 400, out, muted);
      return cy;
    }
  }
}

function baseline (font: { size: number; lead: number }): number {
  return Math.round((font.lead - font.size) / 2 + font.size * ASCENT);
}

function runWidth (text: string, run: NoteRun, size: number, weight: number): number {
  if (run.code) return measureMono(text, size - 1);
  return measureText(text, size, run.strong || weight >= 600 ? 600 : 400);
}

/** A word: the text between two spaces, in one or several styles (`**100** to`). */
type Token =
  | { kind: 'word'; segs: NoteRun[] }
  | { kind: 'space'; style: NoteRun }
  | { kind: 'break' };

function tokenize (inlines: MdInline[]): Token[] {
  const out: Token[] = [];
  for (const inline of inlines) {
    if (isBreak(inline)) {
      out.push({ kind: 'break' });
      continue;
    }
    for (const piece of inline.text.split(/(\s+)/)) {
      if (piece === '') continue;
      const last = out[out.length - 1];
      if (/^\s+$/.test(piece)) {
        if (last?.kind !== 'space') out.push({ kind: 'space', style: styleOf(inline) });
      } else if (last?.kind === 'word') {
        last.segs.push({ ...styleOf(inline), text: piece });
      } else {
        out.push({ kind: 'word', segs: [{ ...styleOf(inline), text: piece }] });
      }
    }
  }
  return out;
}

/**
 * Break inline runs into lines at `width`, greedily, at spaces; a style
 * change inside a word is no place to break. A word wider than a line
 * breaks between characters.
 */
function flow (
  inlines: MdInline[],
  x: number,
  y: number,
  width: number,
  size: number,
  lead: number,
  weight: number,
  out: NoteText,
  muted: boolean,
): number {
  const lines: NoteRun[][] = [[]];
  let cx = 0;
  let space: NoteRun | undefined;
  const add = (text: string, style: NoteRun): void => {
    const line = lines[lines.length - 1];
    const prev = line[line.length - 1];
    if (prev && sameStyle(prev, style)) prev.text += text;
    else line.push({ ...styleOf(style), text });
    cx += runWidth(text, style, size, weight);
  };
  const newLine = (): void => {
    lines.push([]);
    cx = 0;
    space = undefined;
  };
  for (const tok of tokenize(inlines)) {
    if (tok.kind === 'break') {
      newLine();
      continue;
    }
    if (tok.kind === 'space') {
      if (cx > 0) space = tok.style;
      continue;
    }
    const w = tok.segs.reduce((sum, seg) => sum + runWidth(seg.text, seg, size, weight), 0);
    const sw = space ? runWidth(' ', space, size, weight) : 0;
    if (cx > 0 && cx + sw + w > width) newLine();
    if (space) add(' ', space);
    space = undefined;
    if (cx + w <= width) {
      for (const seg of tok.segs) add(seg.text, seg);
      continue;
    }
    // A word wider than the line: break it between characters.
    for (const seg of tok.segs) {
      let chunk = '';
      for (const ch of seg.text) {
        if (cx + runWidth(chunk + ch, seg, size, weight) > width && (chunk !== '' || cx > 0)) {
          if (chunk !== '') add(chunk, seg);
          newLine();
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk !== '') add(chunk, seg);
    }
  }
  const font = { size, lead };
  lines.forEach((runs, k) => {
    out.lines.push({ x, y: y + k * lead + baseline(font), size, weight, runs, muted: muted || undefined });
  });
  return y + lines.length * lead;
}

function styleOf (r: NoteRun): NoteRun {
  const s: NoteRun = { text: '' };
  if (r.strong) s.strong = true;
  if (r.em) s.em = true;
  if (r.strike) s.strike = true;
  if (r.code) s.code = true;
  if (r.href !== undefined) s.href = r.href;
  return s;
}

function sameStyle (a: NoteRun, b: NoteRun): boolean {
  return !!a.strong === !!b.strong && !!a.em === !!b.em && !!a.strike === !!b.strike
    && !!a.code === !!b.code && a.href === b.href;
}

/** Break a code line between characters at `width`; code keeps its spaces. */
function hardWrap (line: string, width: number): string[] {
  const perLine = Math.max(1, Math.floor(width / (CODE.size * 0.6)));
  const chars = [...line];
  if (chars.length <= perLine) return [line];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += perLine) out.push(chars.slice(i, i + perLine).join(''));
  return out;
}
