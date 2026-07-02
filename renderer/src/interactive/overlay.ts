/**
 * Interaction overlay.
 *
 * The serializer draws the visible shapes; this module draws the
 * invisible interaction layer on top -- transparent drag handles, row and
 * ref hit areas, caret targets -- plus the selection highlights. Every
 * element is positioned from the same DiagramModel the serializer used, so
 * the two layers cannot drift, and no shape geometry is duplicated.
 *
 * Elements carry `data-*` attributes the mount reads via event delegation:
 *   data-handle="entity|edge|container"  a drag handle (+ data-id/data-name)
 *   data-field + data-id                 a field row (selection)
 *   data-caret + data-id + data-path     a collapse/expand caret
 *   data-ref                             a relationship line
 *   data-select-entity / -container      a bare selection target
 */
import type { DiagramModel, EntityLayout } from '../layout/layout.ts';
import { CONTAINER_HEADER_HEIGHT, ENTITY_HEADER_HEIGHT } from '../layout/layout.ts';
import type { Theme } from '../style/theme.ts';
import { resolveRef } from '../geometry/ref-path.ts';

const INDENT_PX = 14;

export type Selection =
  | { kind: 'entity'; id: string }
  | { kind: 'field'; id: string; path: string }
  | { kind: 'ref'; id: string }
  | { kind: 'container'; name: string }
  | null;

export function buildOverlay (model: DiagramModel, selection: Selection, theme: Theme): string {
  const parts: string[] = ['<g class="xdbml-overlay">'];

  for (const c of model.containers) parts.push(containerOverlay(c, selection, theme));
  for (const r of model.refs) parts.push(refOverlay(r, model, selection, theme));
  for (const e of model.entities) parts.push(entityOverlay(e, 'entity', selection, theme));
  for (const e of model.edges) parts.push(entityOverlay(e.box, 'edge', selection, theme));

  parts.push('</g>');
  return parts.join('');
}

function entityOverlay (entity: EntityLayout, handle: 'entity' | 'edge', sel: Selection, theme: Theme): string {
  const { x, y, width, height } = entity.bounds;
  const id = attr(entity.id);
  const parts: string[] = [`<g data-xdbml="${handle}" data-id="${id}">`];

  // Selection highlight (drawn first, under the transparent hit areas).
  // The entity outline highlights for both entity and field selection; the
  // field-row tint itself is drawn by the serializer (under the field name,
  // so the name stays readable).
  if (sel && (sel.kind === 'entity' || sel.kind === 'field') && sel.id === entity.id) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="none" ` +
      `stroke="${theme.row.selectStrip}" stroke-width="2" pointer-events="none"/>`,
    );
  }

  // Header drag handle (also a click target: a no-move press selects).
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${ENTITY_HEADER_HEIGHT}" ` +
    `fill="transparent" data-handle="${handle}" data-id="${id}" style="cursor:move"/>`,
  );

  // Per-field hit areas and caret targets.
  for (const f of entity.fields) {
    parts.push(
      `<rect x="${x + 1}" y="${y + f.rowY}" width="${width - 2}" height="${f.rowHeight}" ` +
      `fill="transparent" data-field="${attr(f.path)}" data-id="${id}" style="cursor:pointer"/>`,
    );
    if (f.hasChildren) {
      parts.push(
        `<rect x="${x + 12 + f.indent * INDENT_PX - 2}" y="${y + f.rowY + 4}" width="14" height="16" ` +
        `fill="transparent" data-caret="1" data-id="${id}" data-path="${attr(f.path)}" style="cursor:pointer"/>`,
      );
    }
  }

  parts.push('</g>');
  return parts.join('');
}

function containerOverlay (
  c: DiagramModel['containers'][number],
  sel: Selection,
  theme: Theme,
): string {
  const { x, y, width, height } = c.bounds;
  const name = attr(c.name);
  const parts: string[] = [`<g data-xdbml="container" data-name="${name}">`];

  if (sel && sel.kind === 'container' && sel.name === c.name) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="none" ` +
      `stroke="${theme.row.selectStrip}" stroke-width="2.5" stroke-dasharray="4 3" pointer-events="none"/>`,
    );
  }

  // Body click target (select), drawn under the title handle.
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" ` +
    `fill="transparent" data-select-container="${name}" style="cursor:pointer"/>`,
  );
  // Title-bar drag handle.
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${CONTAINER_HEADER_HEIGHT}" ` +
    `fill="transparent" data-handle="container" data-name="${name}" style="cursor:grab"/>`,
  );

  parts.push('</g>');
  return parts.join('');
}

function refOverlay (
  r: DiagramModel['refs'][number],
  model: DiagramModel,
  sel: Selection,
  theme: Theme,
): string {
  const resolved = resolveRef(r, model.entities, model.containers);
  if (!resolved) return '';
  const id = attr(r.id);
  const parts: string[] = [`<g data-xdbml="ref" data-id="${id}">`];

  if (sel && sel.kind === 'ref' && sel.id === r.id) {
    parts.push(
      `<path d="${resolved.path.d}" fill="none" stroke="${theme.row.selectStrip}" stroke-width="2.5" pointer-events="none"/>`,
    );
  }
  // Wide transparent hit path.
  parts.push(
    `<path d="${resolved.path.d}" fill="none" stroke="transparent" stroke-width="14" ` +
    `data-ref="${id}" style="cursor:pointer"/>`,
  );

  parts.push('</g>');
  return parts.join('');
}

function attr (s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
