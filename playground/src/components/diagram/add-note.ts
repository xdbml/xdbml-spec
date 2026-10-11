/**
 * "Add sticky note": the text edits that add a sticky note to the source
 * (spec §19).
 *
 * The playground's document is its source text, so a note added from the
 * diagram toolbar is a `Note` declaration written into the editor, where
 * Monaco's undo takes it back. The note goes:
 *
 *   - into the selected Container, when the document declares
 *     `xdbml: 0.7` or later, which a sticky note in a Container needs
 *     (§19.4); otherwise at the end of the document;
 *   - and, when a diagram view is on display, into its `Notes` category,
 *     so the new note shows there (§18.2), unless the category or the
 *     diagram view already lists every element.
 *
 * Pure: takes the source and its parsed document, returns the edits and the
 * id of the new note. Offsets are those of the source given.
 */
import { stickyNotes, versionAtLeast } from '@xdbml/parse';
import type { ContainerDeclaration, DiagramViewDeclaration, XDbmlDocument } from '@xdbml/parse';

export interface TextEdit {
  /** Offset in the source where the edit starts. */
  offset: number;
  /** Characters replaced from `offset`; 0 for an insertion. */
  length: number;
  text: string;
}

export interface StickyNotePlan {
  edits: TextEdit[];
  /** The id of the new note: `sales.note_1` in a Container, `note_1` at the top level. */
  noteName: string;
  /** Offset, in the source after the edits, of the new `Note` keyword, for revealing it. */
  revealOffset: number;
}

export const NEW_NOTE_TEXT = 'Write something...';

/** The indentation of the line holding `offset`. */
function indentAt (source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(source.slice(start))?.[0] ?? '';
}

/** True when only whitespace precedes `offset` on its line. */
function aloneOnLine (source: string, offset: number): boolean {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(start, offset).trim() === '';
}

/** The offset of the start of the line holding `offset`. */
function lineStart (source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1;
}

/**
 * Insert `block` (lines without a trailing newline, indented for the inside
 * of the body) before the closing brace at `brace`.
 */
function beforeBrace (source: string, brace: number, block: string): TextEdit {
  if (aloneOnLine(source, brace)) return { offset: lineStart(source, brace), length: 0, text: `${block}\n` };
  return { offset: brace, length: 0, text: `\n${block}\n${indentAt(source, brace)}` };
}

/** The edits that add a sticky note; see the module comment. */
export function planStickyNote (
  source: string,
  doc: XDbmlDocument,
  options: { container?: string; diagramView?: string | null } = {},
): StickyNotePlan {
  const taken = new Set(stickyNotes(doc).map((n) => n.name));
  let k = 1;
  while (taken.has(`note_${k}`)) k++;
  const name = `note_${k}`;

  const container = options.container !== undefined && versionAtLeast(doc, '0.7')
    ? doc.statements.find((s): s is ContainerDeclaration => s.kind === 'ContainerDeclaration' && s.name === options.container)
    : undefined;

  const edits: TextEdit[] = [];
  let noteEdit: TextEdit;
  let noteName: string;
  if (container) {
    const brace = container.span.end.offset - 1;
    const inner = `${indentAt(source, container.span.start.offset)}  `;
    noteEdit = beforeBrace(source, brace, `\n${inner}Note ${name} {\n${inner}  '${NEW_NOTE_TEXT}'\n${inner}}`);
    noteName = `${container.name}.${name}`;
  } else {
    const trailing = /\n*$/.exec(source)?.[0].length ?? 0;
    const lead = source.length === 0 ? '' : trailing >= 2 ? '' : trailing === 1 ? '\n' : '\n\n';
    noteEdit = { offset: source.length, length: 0, text: `${lead}Note ${name} {\n  '${NEW_NOTE_TEXT}'\n}\n` };
    noteName = name;
  }
  edits.push(noteEdit);

  const view = options.diagramView
    ? doc.statements.find((s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration' && s.name === options.diagramView)
    : undefined;
  if (view && !view.wildcardBody) {
    const notes = view.categories.find((c) => c.category === 'Notes');
    if (!notes) {
      const inner = `${indentAt(source, view.span.start.offset)}  `;
      edits.push(beforeBrace(source, view.span.end.offset - 1, `${inner}Notes {\n${inner}  ${noteName}\n${inner}}`));
    } else if (!notes.wildcard) {
      const last = notes.items[notes.items.length - 1];
      if (last) {
        edits.push({ offset: last.span.end.offset, length: 0, text: `\n${indentAt(source, last.span.start.offset)}${noteName}` });
      } else {
        const open = source.indexOf('{', notes.span.start.offset);
        const close = notes.span.end.offset - 1;
        const ind = indentAt(source, notes.span.start.offset);
        edits.push({ offset: open + 1, length: close - open - 1, text: `\n${ind}  ${noteName}\n${ind}` });
      }
    }
  }

  // The offset of the note's keyword after every edit: edits before it shift it.
  const keyword = noteEdit.offset + noteEdit.text.indexOf('Note ');
  const shift = edits
    .filter((e) => e !== noteEdit && e.offset < noteEdit.offset)
    .reduce((sum, e) => sum + e.text.length - e.length, 0);
  return { edits: edits.sort((a, b) => b.offset - a.offset), noteName, revealOffset: keyword + shift };
}

/** Apply edits to a source, the way the editor does; for tests and previews. */
export function applyTextEdits (source: string, edits: ReadonlyArray<TextEdit>): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.offset - a.offset)) {
    out = out.slice(0, e.offset) + e.text + out.slice(e.offset + e.length);
  }
  return out;
}
