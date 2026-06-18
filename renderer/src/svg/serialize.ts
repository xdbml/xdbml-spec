/**
 * SVG serializer: DiagramModel -> a self-contained SVG string.
 *
 * This is the single source of visual truth for xDBML diagrams. It
 * reproduces, in framework-free string form, exactly what the playground's
 * Vue components (DiagramCanvas, EntityCard, RefLine, EdgeLine,
 * CrowFootGlyph) paint, with the styling inlined so the output renders
 * standalone in an API response, an MCP result, or an artifact iframe.
 *
 * The static serializer omits the playground's interactive scaffolding
 * (transparent hit areas, cursors, selection highlights, drag handles).
 * Collapse state is honored: rows already removed from the model by
 * `buildDiagram(collapsedPaths)` don't appear, and the caret on a
 * collapsed parent points right (the same `collapsedPaths` set is passed
 * here so the glyph direction matches).
 */
import type {
  ContainerLayout,
  DiagramModel,
  EdgeLayout,
  EntityLayout,
  FieldLayout,
  RefLayout,
} from '../layout/layout.ts';
import { makeCollapsedKey, readableInk } from '../layout/layout.ts';
import { type DeepPartial, resolveTheme, type Theme } from '../style/theme.ts';
import { crowFootGroup } from '../geometry/crowfoot.ts';
import { glyphTransform, labelAnchor } from '../geometry/placement.ts';
import { refLabelX, refLabelY, resolveRef } from '../geometry/ref-path.ts';
import { edgeConnectors, edgeLabelX, edgeLabelY } from '../geometry/edge-path.ts';
import { escapeXml } from './util.ts';

const HEADER_HEIGHT = 32;
const INDENT_PX = 14;

// Field selection tint (matches the interactive overlay's accent).
const SELECT_FILL = '#dbeafe';
const SELECT_STRIP = '#2563eb';

export interface SerializeOptions {
  /**
   * Collapse state, as the same `${entityId}::${path}` keys
   * `buildDiagram` consumes. Only affects caret direction here; the
   * model passed in already reflects which rows are visible.
   */
  collapsedPaths?: ReadonlySet<string>;
  /** Partial theme override merged over the defaults. */
  theme?: DeepPartial<Theme>;
  /**
   * Solid background color painted behind the whole diagram. Omitted by
   * default (transparent), matching the playground, where the grid is a
   * CSS backdrop rather than part of the SVG.
   */
  background?: string;
  /**
   * Emit inner markup only (the `<defs>` and content groups) without the
   * enclosing `<svg>` wrapper. Used by the interactive mount, which
   * composes the serializer's shapes and its own interaction overlay
   * inside a single zoomable `<svg>` it controls. Default false.
   */
  inner?: boolean;
  /**
   * The currently selected field, drawn with a selection tint as part of
   * the row (under the field name, over the zebra/pk fill) so the name
   * stays readable on top -- matching the playground's prior behavior.
   */
  selectedField?: { entityId: string; path: string };
}

export function serializeDiagram (model: DiagramModel, options: SerializeOptions = {}): string {
  const theme = resolveTheme(options.theme);
  const collapsed = options.collapsedPaths ?? new Set<string>();

  const parts: string[] = [];
  const inner = options.inner === true;

  if (!inner) {
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${model.width}" height="${model.height}" ` +
      `viewBox="0 0 ${model.width} ${model.height}" font-family="${theme.fontSans}">`,
    );
  }

  parts.push(defs(theme));

  if (options.background && !inner) {
    parts.push(`<rect x="0" y="0" width="${model.width}" height="${model.height}" fill="${options.background}"/>`);
  }

  for (const c of model.containers) parts.push(container(c, theme));
  for (const r of model.refs) parts.push(refLine(r, model, theme));
  for (const e of model.edges) parts.push(edgeLine(e, model.entities, theme));
  for (const e of model.entities) parts.push(entityCard(e, collapsed, theme, options.selectedField));
  for (const e of model.edges) parts.push(entityCard(e.box, collapsed, theme, options.selectedField));

  const unresolved = model.refs.filter((r) => r.unresolved).length;
  if (unresolved > 0) parts.push(banner(unresolved, model, theme));

  if (!inner) parts.push('</svg>');
  return parts.join('');
}

/* ------------------------------------------------------------------ defs */

function defs (theme: Theme): string {
  const s = theme.shadow;
  return (
    '<defs>' +
    '<filter id="entity-shadow" x="-5%" y="-5%" width="110%" height="115%">' +
    `<feDropShadow dx="${s.dx}" dy="${s.dy}" stdDeviation="${s.stdDeviation}" ` +
    `flood-color="${s.floodColor}" flood-opacity="${s.floodOpacity}"/>` +
    '</filter>' +
    '</defs>'
  );
}

/* ------------------------------------------------------------- container */

function container (c: ContainerLayout, theme: Theme): string {
  const { x, y, width, height } = c.bounds;
  const t = theme.container;
  const parts: string[] = ['<g>'];

  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" ` +
    `fill="${t.fill}" stroke="${t.stroke}" stroke-width="${t.strokeWidth}" stroke-dasharray="${t.dashArray}"/>`,
  );

  const accent = c.accentColor || t.headerFallback;
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="32" fill="${accent}" rx="6"/>`,
    `<rect x="${x}" y="${y + 16}" width="${width}" height="16" fill="${accent}"/>`,
  );

  parts.push(
    text({
      x: x + 12, y: y + 21, fill: c.headerInk, size: 13, weight: 600,
      content: `${escapeXml(c.keyword)} · ${escapeXml(c.name)}`,
    }),
  );

  if (c.target) {
    parts.push(
      text({
        x: x + width - 12, y: y + 21, fill: c.headerInk, size: 11, anchor: 'end',
        opacity: 0.85, content: `→ ${escapeXml(c.target)}`,
      }),
    );
  }

  parts.push('</g>');
  return parts.join('');
}

/* ----------------------------------------------------------- entity card */

function entityCard (entity: EntityLayout, collapsed: ReadonlySet<string>, theme: Theme, selectedField?: { entityId: string; path: string }): string {
  const { x, y, width, height } = entity.bounds;
  const te = theme.entity;
  const parts: string[] = ['<g>'];

  // Card background.
  const dash = entity.isView ? ` stroke-dasharray="${te.viewDashArray}"` : '';
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" ` +
    `fill="${te.fill}" stroke="${te.stroke}" stroke-width="${te.strokeWidth}"${dash} filter="url(#entity-shadow)"/>`,
  );

  // Header band.
  const fill = headerFill(entity, theme);
  const ink = readableInk(fill);
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${HEADER_HEIGHT}" fill="${fill}" rx="5"/>`,
    `<rect x="${x}" y="${y + HEADER_HEIGHT - 6}" width="${width}" height="6" fill="${fill}"/>`,
  );

  // View eye marker.
  if (entity.isView) {
    parts.push(
      `<ellipse cx="${x + 18}" cy="${y + 16}" rx="8" ry="5" fill="none" stroke="${ink}" stroke-width="1.4"/>`,
      `<circle cx="${x + 18}" cy="${y + 16}" r="2" fill="${ink}"/>`,
    );
  }

  // Edge diamond marker.
  if (entity.isEdge) {
    parts.push(
      `<path d="M ${x + 18} ${y + 9} L ${x + 25} ${y + 16} L ${x + 18} ${y + 23} L ${x + 11} ${y + 16} Z" ` +
      `fill="none" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`,
      `<circle cx="${x + 18}" cy="${y + 16}" r="1.8" fill="${ink}"/>`,
    );
  }

  const nameLeftX = x + (entity.isView || entity.isEdge ? 32 : 12);
  parts.push(
    text({ x: nameLeftX, y: y + 20, fill: ink, size: 13, weight: 600, content: escapeXml(entity.name) }),
    text({
      x: x + width - 12, y: y + 20, fill: ink, size: 10, anchor: 'end', opacity: 0.85,
      content: escapeXml(entity.keyword),
    }),
  );

  // Field rows.
  entity.fields.forEach((field, i) => {
    parts.push(fieldRow(entity, field, i, collapsed, theme, selectedField));
  });

  parts.push('</g>');
  return parts.join('');
}

function fieldRow (
  entity: EntityLayout,
  field: FieldLayout,
  index: number,
  collapsed: ReadonlySet<string>,
  theme: Theme,
  selectedField?: { entityId: string; path: string },
): string {
  const { x, y, width } = entity.bounds;
  const tr = theme.row;
  const parts: string[] = [];

  const isSelected = selectedField !== undefined
    && selectedField.entityId === entity.id
    && selectedField.path === field.path;

  // Row tint. A selected field gets the selection tint (over any zebra/pk
  // fill) plus an accent strip; the field name is drawn afterwards on top,
  // so it stays readable rather than being covered by a highlight overlay.
  const fill = isSelected ? SELECT_FILL : rowFill(field, index, theme);
  if (fill) {
    parts.push(
      `<rect x="${x + 1}" y="${y + field.rowY}" width="${width - 2}" height="${field.rowHeight}" fill="${fill}"/>`,
    );
  }
  if (isSelected) {
    parts.push(
      `<rect x="${x + 1}" y="${y + field.rowY}" width="3" height="${field.rowHeight}" fill="${SELECT_STRIP}"/>`,
    );
  }

  // Indent guides.
  for (let g = 0; g < field.indent; g += 1) {
    const gx = x + 12 + g * INDENT_PX + 4;
    parts.push(
      `<line x1="${gx}" y1="${y + field.rowY}" x2="${gx}" y2="${y + field.rowY + field.rowHeight}" ` +
      `stroke="${tr.indentGuide}" stroke-width="1"/>`,
    );
  }

  // Caret.
  if (field.hasChildren) {
    const isCollapsed = collapsed.has(makeCollapsedKey(entity.id, field.path));
    parts.push(
      text({
        x: x + 12 + field.indent * INDENT_PX + 4,
        y: y + field.rowY + 16,
        fill: tr.caret,
        size: 9,
        anchor: 'middle',
        content: isCollapsed ? '▸' : '▾',
      }),
    );
  }

  // Field name.
  const nameLeftEdge = 12 + field.indent * INDENT_PX + 12;
  parts.push(
    text({
      x: x + nameLeftEdge,
      y: y + field.rowY + 16,
      fill: nameColor(field, theme),
      size: 12,
      weight: field.flags.pk ? 600 : 400,
      italic: field.synthetic === true,
      content: escapeXml(field.name),
    }),
  );

  // Type label (right-aligned, monospace).
  parts.push(
    text({
      x: x + width - 12,
      y: y + field.rowY + 16,
      fill: tr.typeLabel,
      size: 11,
      anchor: 'end',
      font: theme.fontMono,
      content: escapeXml(truncate(field.typeLabel, 22)),
    }),
  );

  // Flag badges.
  const badges = fieldBadges(field, theme);
  if (badges.length) {
    const bx = x + badgeX(field);
    badges.forEach((b, bi) => {
      const cx = bx + bi * 14;
      parts.push(
        `<circle cx="${cx}" cy="${y + field.rowY + 12}" r="6" fill="${b.color}"/>`,
        text({
          x: cx, y: y + field.rowY + 15, fill: 'white', size: 8, weight: 700, anchor: 'middle',
          content: b.label,
        }),
      );
    });
  }

  return parts.join('');
}

/* -------------------------------------------------------------- ref line */

function refLine (ref: RefLayout, model: DiagramModel, theme: Theme): string {
  const resolved = resolveRef(ref, model.entities, model.containers);
  if (!resolved) return '';
  const tr = theme.ref;
  const parts: string[] = ['<g>'];

  parts.push(`<path d="${resolved.path.d}" fill="none" stroke="${tr.line}" stroke-width="1.5"/>`);

  for (const end of [resolved.source, resolved.target]) {
    parts.push(crowFootGroup(end.card, tr.line, glyphTransform(end.side, end.x, end.y)));
    if (end.label) {
      parts.push(
        text({
          x: refLabelX(end.side, end.x),
          y: refLabelY(end.side, end.y),
          fill: tr.label,
          size: 9,
          weight: 500,
          anchor: labelAnchor(end.side),
          content: escapeXml(end.label),
        }),
      );
    }
  }

  parts.push('</g>');
  return parts.join('');
}

/* ------------------------------------------------------------- edge line */

function edgeLine (edge: EdgeLayout, entities: EntityLayout[], theme: Theme): string {
  const connectors = edgeConnectors(edge, entities);
  if (!connectors.length) return '';
  const td = theme.edge;
  const parts: string[] = ['<g>'];

  for (const c of connectors) {
    parts.push(`<path d="${c.d}" fill="none" stroke="${td.line}" stroke-width="1.5"/>`);
    parts.push(crowFootGroup(c.card, td.line, glyphTransform(c.side, c.x, c.y)));
    if (c.label) {
      parts.push(
        text({
          x: edgeLabelX(c.side, c.x),
          y: edgeLabelY(c.side, c.y),
          fill: td.label,
          size: 9,
          weight: 500,
          anchor: labelAnchor(c.side),
          content: escapeXml(c.label),
        }),
      );
    }
  }

  parts.push('</g>');
  return parts.join('');
}

/* ---------------------------------------------------------------- banner */

function banner (count: number, model: DiagramModel, theme: Theme): string {
  const tb = theme.banner;
  const word = count === 1 ? 'Ref' : 'Refs';
  return (
    '<g>' +
    `<rect x="12" y="${model.height - 36}" width="280" height="24" rx="4" ` +
    `fill="${tb.fill}" stroke="${tb.stroke}" stroke-width="1"/>` +
    text({
      x: 22, y: model.height - 19, fill: tb.text, size: 11,
      content: `${count} ${word} couldn't be resolved`,
    }) +
    '</g>'
  );
}

/* --------------------------------------------------------------- helpers */

function headerFill (entity: EntityLayout, theme: Theme): string {
  if (entity.headerColor) return entity.headerColor;
  if (entity.keyword === 'Collection' || entity.keyword === 'Record') {
    return theme.entity.headerCollectionRecord;
  }
  return theme.entity.headerDefault;
}

function rowFill (field: FieldLayout, index: number, theme: Theme): string | undefined {
  if (field.flags.pk) return theme.row.pkFill;
  if (field.synthetic) return theme.row.syntheticFill;
  if (index % 2 === 1) return theme.row.zebraFill;
  return undefined;
}

function nameColor (field: FieldLayout, theme: Theme): string {
  if (field.flags.pk) return theme.row.namePk;
  if (field.synthetic) return theme.row.nameSynthetic;
  return theme.row.nameDefault;
}

interface Badge { label: string; color: string }

function fieldBadges (field: FieldLayout, theme: Theme): Badge[] {
  const out: Badge[] = [];
  if (field.flags.pk) out.push({ label: 'P', color: theme.badges.pk });
  if (field.flags.fk) out.push({ label: 'F', color: theme.badges.fk });
  if (field.flags.unique && !field.flags.pk) out.push({ label: 'U', color: theme.badges.unique });
  if (field.flags.notNull) out.push({ label: '!', color: theme.badges.notNull });
  return out;
}

function badgeX (field: FieldLayout): number {
  const nameStart = 12 + field.indent * INDENT_PX + 12;
  const nameWidth = field.name.length * 6.5;
  return nameStart + nameWidth + 8;
}

function truncate (s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

interface TextSpec {
  x: number;
  y: number;
  fill: string;
  size: number;
  content: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  opacity?: number;
  italic?: boolean;
  font?: string;
}

function text (spec: TextSpec): string {
  const attrs: string[] = [
    `x="${spec.x}"`,
    `y="${spec.y}"`,
    `fill="${spec.fill}"`,
    `font-size="${spec.size}"`,
  ];
  if (spec.weight !== undefined) attrs.push(`font-weight="${spec.weight}"`);
  if (spec.anchor) attrs.push(`text-anchor="${spec.anchor}"`);
  if (spec.opacity !== undefined) attrs.push(`opacity="${spec.opacity}"`);
  if (spec.italic) attrs.push('font-style="italic"');
  if (spec.font) attrs.push(`font-family="${spec.font}"`);
  return `<text ${attrs.join(' ')}>${spec.content}</text>`;
}
