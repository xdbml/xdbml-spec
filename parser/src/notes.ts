/**
 * Sticky notes and the note of the project (spec §19, v0.7).
 *
 * A named `Note` is a sticky note: at the top level, or in a Container body,
 * where the Container carries it on the canvas (§19.4). A top-level name may
 * be qualified, `Note core.legend`, the DBML form of a sticky note in a
 * schema, which places the note in the implicit Container `core` (§19.2).
 * A top-level `Note` without a name is the note of the project (§19.5).
 *
 * Ids follow those of entities: a sticky note in a Container is
 * `container.name`, one at the top level is its name as declared.
 */

import type {
  ContainerDeclaration,
  NoteBlock,
  NoteDeclaration,
  ProjectDeclaration,
  SettingValue,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { versionAtLeast } from './relationships.ts';
import { isQualifiedName, joinName, lastNameSegment, nameQualifier, quoteNameSegment, splitName } from './names.ts';

/** A sticky note with its place in the model. */
export interface PlacedStickyNote {
  decl: NoteDeclaration;
  /** The Container whose body declares the note (§19.4). */
  container?: ContainerDeclaration;
  /** The Container holding the note: the one declaring it, or the one a qualified top-level name implies. */
  containerName?: string;
  /** `sales.order_states` in a Container, the name as declared at the top level; the form of names.ts. */
  id: string;
  /** The last segment of the id, in the form of names.ts. */
  name: string;
  /** True when declared outside any Container under its bare name (§19.4). */
  topLevel: boolean;
}

/**
 * The sticky notes of a document, in declaration order, a Container's notes
 * where the Container stands. Pass a flattened document to include the notes
 * of imported files.
 */
export function stickyNotes (doc: XDbmlDocument): PlacedStickyNote[] {
  const out: PlacedStickyNote[] = [];
  for (const s of doc.statements) {
    if (s.kind === 'NoteDeclaration' && s.name !== undefined) {
      const qualifier = nameQualifier(s.name);
      out.push({
        decl: s,
        containerName: qualifier,
        id: s.name,
        name: qualifier ? quoteNameSegment(lastNameSegment(s.name)) : s.name,
        topLevel: qualifier === undefined,
      });
    } else if (s.kind === 'ContainerDeclaration') {
      for (const b of s.body) {
        if (b.kind !== 'NoteDeclaration' || b.name === undefined) continue;
        out.push({
          decl: b,
          container: s,
          containerName: s.name,
          id: joinName([...splitName(s.name), ...splitName(b.name)]),
          name: b.name,
          topLevel: false,
        });
      }
    }
  }
  return out;
}

/** The outcome of naming a sticky note: the note, several candidates, or nothing. */
export type StickyNoteResolution =
  | { ok: true; note: PlacedStickyNote }
  | { ok: false; reason: 'unresolved' }
  | { ok: false; reason: 'ambiguous'; candidates: PlacedStickyNote[] };

/**
 * Resolve the name of a sticky note (§19.4), as a name in a diagram view
 * resolves (§18.3): a qualified name names the note with that id; an
 * unqualified name names the note declared outside any Container under that
 * name, if there is one, and otherwise the one note of that name inside a
 * Container.
 */
export function resolveStickyNote (notes: ReadonlyArray<PlacedStickyNote>, name: string): StickyNoteResolution {
  const direct = notes.find((n) => n.id === name);
  if (direct) return { ok: true, note: direct };
  if (isQualifiedName(name)) return { ok: false, reason: 'unresolved' };
  const inside = notes.filter((n) => n.name === name);
  if (inside.length === 1) return { ok: true, note: inside[0] };
  if (inside.length > 1) return { ok: false, reason: 'ambiguous', candidates: inside };
  return { ok: false, reason: 'unresolved' };
}

/** The note of the project and where it is written (§19.5). */
export interface ProjectNote {
  body: string;
  /** The `Note` of the Project block, or the top-level `Note` without a name. */
  source: NoteBlock | NoteDeclaration;
}

/**
 * The note of the project (§19.5): the note of the Project block when it
 * carries one, otherwise the first top-level `Note` without a name.
 */
export function projectNote (doc: XDbmlDocument): ProjectNote | undefined {
  const project = doc.statements.find((s): s is ProjectDeclaration => s.kind === 'ProjectDeclaration');
  const own = project?.body.find((b): b is NoteBlock => b.kind === 'NoteBlock');
  if (own) return { body: own.body, source: own };
  const unnamed = doc.statements.find((s): s is NoteDeclaration => s.kind === 'NoteDeclaration' && s.name === undefined);
  return unnamed ? { body: unnamed.body, source: unnamed } : undefined;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether a value is a color of a sticky note: `#rgb`, `#rrggbb` or `none` (§19.3). */
export function isStickyNoteColor (v: SettingValue | null): boolean {
  if (!v) return false;
  if (v.kind === 'StringValue') return HEX_COLOR.test(v.value) || v.value.toLowerCase() === 'none';
  return v.kind === 'IdentifierValue' && v.value.toLowerCase() === 'none';
}

/**
 * The conditions of §19.7 that name resolution does not report. Takes the
 * document as parsed, before module resolution: an imported note is checked
 * in its own file. Two sticky notes of one name in one scope are reported
 * with the other duplicate declarations (`duplicate-declaration`).
 */
export function checkNotes (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const v07 = versionAtLeast(doc, '0.7');

  for (const note of stickyNotes(doc)) {
    const color = note.decl.settings.find((s) => s.name === 'color');
    if (color && !isStickyNoteColor(color.value)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-note-color',
        message: `The color of sticky note '${note.id}' is '${color.value ? valueText(color.value) : '(flag)'}'. ` +
          "A sticky note takes '#rgb', '#rrggbb', or none for text without a background (spec §19.3).",
        span: color.span,
      });
    }
    if (note.container && !v07) {
      diagnostics.push({
        severity: 'error',
        code: 'construct-requires-version',
        message: `Sticky note '${note.decl.name}' sits in Container '${note.container.name}', an xDBML extension ` +
          "that needs 'xdbml: 0.7' or later at the top of the document. Move it to the top level, or declare the version (spec §19.4).",
        span: note.decl.span,
      });
    }
  }

  // §19.5: one note for the project. The Project block's note applies when
  // there is one; otherwise the first top-level Note without a name.
  const project = doc.statements.find((s): s is ProjectDeclaration => s.kind === 'ProjectDeclaration');
  const projectHasNote = !!project?.body.some((b) => b.kind === 'NoteBlock');
  let applied = projectHasNote;
  for (const s of doc.statements) {
    if (s.kind !== 'NoteDeclaration' || s.name !== undefined) continue;
    if (!applied) {
      applied = true;
      continue;
    }
    diagnostics.push({
      severity: 'warning',
      code: 'duplicate-project-note',
      message: projectHasNote
        ? 'The Project block already carries the note of the project, so this Note without a name applies nothing. ' +
          'Give it a name to make it a sticky note, or remove it (spec §19.5).'
        : 'An earlier Note without a name is already the note of the project, so this one applies nothing. ' +
          'Give it a name to make it a sticky note, or remove it (spec §19.5).',
      span: s.span,
    });
  }
  return diagnostics;
}

function valueText (v: SettingValue): string {
  switch (v.kind) {
    case 'StringValue': return v.value;
    case 'NumberValue': return v.value;
    case 'BooleanValue': return String(v.value);
    case 'IdentifierValue': return v.value;
    default: return v.kind;
  }
}
