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
  NoteLayout,
  RefLayout,
} from '../layout/layout.ts';
import { makeCollapsedKey, NOTE_PADDING, readableInk } from '../layout/layout.ts';
import type { NoteLine, NoteRun } from '../layout/note-text.ts';
import { type DeepPartial, resolveTheme, type Theme } from '../style/theme.ts';
import { crowFootGroup } from '../geometry/crowfoot.ts';
import { glyphTransform, labelAnchor } from '../geometry/placement.ts';
import { refLabelX, refLabelY, resolveRef } from '../geometry/ref-path.ts';
import { edgeConnectors, edgeLabelX, edgeLabelY } from '../geometry/edge-path.ts';
import { escapeXml } from './util.ts';
import { ENTITY_NAME_FONT_SIZE, FIELD_FONT_SIZE, measureText } from './metrics.ts';
import { layoutSupertypeGroups, longestSegmentMidpoint, type SupertypeGroupGeometry } from '../geometry/supertype-symbol.ts';
import { layoutDeps, type DepGeometry } from '../geometry/dep-path.ts';

const HEADER_HEIGHT = 32;
const INDENT_PX = 14;

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
  /**
   * More rows drawn with the selection tint: the fields at the ends of a
   * selected Dep (spec §27.7).
   */
  highlightedFields?: ReadonlyArray<{ entityId: string; path: string }>;
  /**
   * When set (and not in `inner` mode), draws a small clickable
   * "Open in xDBML playground" link in a footer band below the diagram.
   * The href is precomputed by `renderToSVG` (an lz-string `#s=` share
   * hash the playground already decodes), so the serializer stays free of
   * the source text and the share codec.
   */
  playgroundLink?: { href: string; label: string };
  /**
   * Draw relationship names: the name of a named `Ref` on its line, the
   * name of each supertype group beside its symbol (spec §12.9), and the
   * name of a Dep at its junction (§27.7). Off by default.
   */
  showRelationshipNames?: boolean;
}

export function serializeDiagram (model: DiagramModel, options: SerializeOptions = {}): string {
  const theme = resolveTheme(options.theme);
  const collapsed = options.collapsedPaths ?? new Set<string>();

  const parts: string[] = [];
  const inner = options.inner === true;

  // A "playground" footer link (drawn only for standalone, non-inner SVGs)
  // adds a short band beneath the diagram so the link never overlaps content.
  const link = inner ? undefined : options.playgroundLink;
  const footerH = link ? 28 : 0;
  const canvasH = model.height + footerH;

  if (!inner) {
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${model.width}" height="${canvasH}" ` +
      `viewBox="0 0 ${model.width} ${canvasH}" font-family="${theme.fontSans}">`,
    );
  }

  parts.push(defs(theme));

  if (options.background && !inner) {
    parts.push(`<rect x="0" y="0" width="${model.width}" height="${canvasH}" fill="${options.background}"/>`);
  }

  for (const c of model.containers) parts.push(container(c, theme));
  const showNames = options.showRelationshipNames === true;
  for (const r of model.refs) parts.push(refLine(r, model, theme, showNames));
  for (const g of layoutDeps(model.deps ?? [], model.entities)) parts.push(depShape(g, theme, showNames));
  for (const g of layoutSupertypeGroups(model)) parts.push(supertypeGroupShape(g, theme, showNames));
  for (const e of model.edges) parts.push(edgeLine(e, model.entities, theme));
  const tinted = new Set<string>(
    [...(options.selectedField ? [options.selectedField] : []), ...(options.highlightedFields ?? [])]
      .map((f) => rowKey(f.entityId, f.path)),
  );
  for (const e of model.entities) parts.push(entityCard(e, collapsed, theme, tinted));
  for (const e of model.edges) parts.push(entityCard(e.box, collapsed, theme, tinted));
  for (const n of model.notes ?? []) parts.push(stickyNote(n, theme));

  const unresolved = model.refs.filter((r) => r.unresolved).length;
  if (unresolved > 0) parts.push(banner(unresolved, model, theme));

  if (link) parts.push(playgroundFooter(link, model.width, model.height, theme));

  if (!inner) parts.push('</svg>');
  return parts.join('');
}

/**
 * Right-aligned, underlined "Open in xDBML playground" link in the footer
 * band beneath the diagram. Clickable when the SVG is viewed as a document
 * (for example the render API's image/svg+xml response opened in a browser
 * tab); inert but still legible when embedded via an <img> tag.
 */
function playgroundFooter (link: { href: string; label: string }, width: number, top: number, theme: Theme): string {
  const y = top + 18;
  return `<a href="${escapeXml(link.href)}" target="_blank" rel="noopener noreferrer">` +
    `<text x="${width - 12}" y="${y}" text-anchor="end" font-size="12" font-weight="500" ` +
    `fill="${theme.footerLink}" text-decoration="underline">${escapeXml(link.label)} →</text></a>`;
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

/** Key of a row in the set of tinted rows. */
function rowKey (entityId: string, path: string): string {
  return `${entityId}\u0000${path}`;
}

function entityCard (entity: EntityLayout, collapsed: ReadonlySet<string>, theme: Theme, tinted: ReadonlySet<string>): string {
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
    text({ x: nameLeftX, y: y + 20, fill: ink, size: ENTITY_NAME_FONT_SIZE, weight: 600, content: escapeXml(entity.name) }),
    text({
      x: x + width - 12, y: y + 20, fill: ink, size: 10, anchor: 'end', opacity: 0.85,
      content: escapeXml(entity.keyword),
    }),
  );

  // Field rows.
  entity.fields.forEach((field, i) => {
    parts.push(fieldRow(entity, field, i, collapsed, theme, tinted));
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
  tinted: ReadonlySet<string>,
): string {
  const { x, y, width } = entity.bounds;
  const tr = theme.row;
  const parts: string[] = [];

  // The selected field, or a field at an end of the selected Dep.
  const isSelected = tinted.has(rowKey(entity.id, field.path));

  // Row tint. A selected field gets the selection tint (over any zebra/pk
  // fill) plus an accent strip; the field name is drawn afterwards on top,
  // so it stays readable rather than being covered by a highlight overlay.
  const fill = isSelected ? tr.selectFill : rowFill(field, index, theme);
  if (fill) {
    parts.push(
      `<rect x="${x + 1}" y="${y + field.rowY}" width="${width - 2}" height="${field.rowHeight}" fill="${fill}"/>`,
    );
  }
  if (isSelected) {
    parts.push(
      `<rect x="${x + 1}" y="${y + field.rowY}" width="3" height="${field.rowHeight}" fill="${tr.selectStrip}"/>`,
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
      size: FIELD_FONT_SIZE,
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
    // Badges are laid out from their left edges so the gap after the name
    // is the same whatever the first badge's shape.
    let bx = x + badgeLeft(field);
    for (const b of badges) {
      const bw = badgeWidth(b);
      const cy = y + field.rowY + 12;
      if (b.wide) {
        parts.push(
          `<rect x="${round(bx)}" y="${cy - 6}" width="${bw}" height="12" rx="6" fill="${b.color}"/>`,
        );
      } else {
        parts.push(`<circle cx="${round(bx + bw / 2)}" cy="${cy}" r="6" fill="${b.color}"/>`);
      }
      parts.push(
        text({
          x: round(bx + bw / 2), y: cy + 3, fill: 'white', size: 8, weight: 700, anchor: 'middle',
          content: b.label,
        }),
      );
      bx += bw + BADGE_GAP;
    }
  }

  return parts.join('');
}

/* -------------------------------------------------------------- ref line */

function refLine (ref: RefLayout, model: DiagramModel, theme: Theme, showNames = false): string {
  const resolved = resolveRef(ref, model.entities, model.containers);
  if (!resolved) return '';
  const tr = theme.ref;
  const parts: string[] = ['<g>'];

  // Line style follows the relationship type (spec 11.13): referential
  // draws solid, foreign master draws dotted, and an inactive relationship
  // of either type draws as a line of small open circles.
  //
  // The open circles are produced by stroking the path twice with a
  // round-capped near-zero dash pattern: the first pass paints filled dots
  // in the line colour, the second paints a narrower dot in the backdrop
  // colour on top, which opens the centre. That makes the effect depend on
  // `theme.ref.inactiveRingCore` matching whatever sits behind the diagram.
  if (ref.inactive) {
    parts.push(
      `<path d="${resolved.path.d}" fill="none" stroke="${tr.line}" ` +
        `stroke-width="${tr.inactiveRingWidth}" stroke-linecap="round" ` +
        `stroke-dasharray="${tr.inactiveDash}"/>`,
      `<path d="${resolved.path.d}" fill="none" stroke="${tr.inactiveRingCore}" ` +
        `stroke-width="${tr.inactiveCoreWidth}" stroke-linecap="round" ` +
        `stroke-dasharray="${tr.inactiveDash}"/>`,
    );
  } else if (ref.relationshipType === 'foreign_master') {
    parts.push(
      `<path d="${resolved.path.d}" fill="none" stroke="${tr.line}" stroke-width="1.5" ` +
        `stroke-linecap="round" stroke-dasharray="${tr.foreignMasterDash}"/>`,
    );
  } else {
    parts.push(`<path d="${resolved.path.d}" fill="none" stroke="${tr.line}" stroke-width="1.5"/>`);
  }

  // Direction markers for an entity-level relationship (spec 11.16.2).
  // `>` points at the target, `<` at the source, `undirected: true` marks
  // both ends, and `-` marks neither.
  if (ref.entityLevel) {
    const arrowAtSource = ref.undirected || ref.operator === '<';
    const arrowAtTarget = ref.undirected || ref.operator === '>';
    if (arrowAtSource) {
      parts.push(directionArrow(tr.line, glyphTransform(resolved.source.side, resolved.source.x, resolved.source.y)));
    }
    if (arrowAtTarget) {
      parts.push(directionArrow(tr.line, glyphTransform(resolved.target.side, resolved.target.x, resolved.target.y)));
    }
  }

  for (const end of [resolved.source, resolved.target]) {
    if (end.card) parts.push(crowFootGroup(end.card, tr.line, glyphTransform(end.side, end.x, end.y)));
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

  // Relationship name, at the middle of the line's longest segment.
  if (showNames && ref.decl.name) {
    const mid = longestSegmentMidpoint(resolved.path.d);
    if (mid) {
      parts.push(
        text({
          x: mid.horizontal ? mid.x : mid.x + 5,
          y: mid.horizontal ? mid.y - 4 : mid.y + 3,
          fill: tr.label,
          size: 10,
          weight: 500,
          anchor: mid.horizontal ? 'middle' : 'start',
          italic: true,
          content: escapeXml(ref.decl.name),
        }),
      );
    }
  }

  parts.push('</g>');
  return parts.join('');
}

/* ------------------------------------------------------ supertype group */

/**
 * One supertype group (spec §12.9): stem from the supertype, half-circle
 * with its marks, and the branches to the subtypes. Drawn above
 * relationship lines and below entity cards.
 */
/**
 * A Dep (spec §27.7): a curve for each dependency, the trunk from each
 * junction, the junctions and the arrowheads, in the Dep's color or the
 * theme's lineage color. A dependency's own color applies to its curve.
 */
function depShape (g: DepGeometry, theme: Theme, showNames: boolean): string {
  const color = g.dep.color ?? theme.lineage.line;
  const parts: string[] = ['<g>'];
  for (const c of g.curves) {
    parts.push(`<path d="${c.d}" fill="none" stroke="${c.color ?? color}" stroke-width="1.5"/>`);
  }
  for (const t of g.trunks) parts.push(`<path d="${t}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
  for (const j of g.junctions) parts.push(`<circle cx="${j.x}" cy="${j.y}" r="3.5" fill="${color}"/>`);
  for (const a of g.arrows) parts.push(`<polygon points="${a}" fill="${color}"/>`);
  if (showNames && g.label && g.dep.name !== undefined) {
    parts.push(
      text({
        x: g.label.x,
        y: g.label.y,
        fill: g.dep.color ?? theme.lineage.label,
        size: 10,
        weight: 500,
        anchor: g.label.anchor,
        italic: true,
        content: escapeXml(g.dep.name),
      }),
    );
  }
  parts.push('</g>');
  return parts.join('');
}

function supertypeGroupShape (g: SupertypeGroupGeometry, theme: Theme, showNames: boolean): string {
  const line = theme.ref.line;
  const dash = ' stroke-dasharray="3.5 2.5"';
  const parts: string[] = [`<g data-supertype-group-shape="${escapeXml(g.group.id)}">`];
  parts.push(`<path d="${g.stem}" fill="none" stroke="${line}" stroke-width="1.5"/>`);
  parts.push(`<path d="${g.branches}" fill="none" stroke="${line}" stroke-width="1.5"/>`);
  parts.push(`<path d="${g.shape}" fill="${theme.canvas.background}" stroke="${line}" stroke-width="1.5" stroke-linejoin="miter"/>`);
  if (g.cross) parts.push(`<path d="${g.cross.d}" fill="none" stroke="${line}" stroke-width="1.5"${g.cross.dashed ? dash : ''}/>`);
  if (g.bar) parts.push(`<path d="${g.bar.d}" fill="none" stroke="${line}" stroke-width="1.5"${g.bar.dashed ? dash : ''}/>`);
  if (showNames) {
    parts.push(
      text({
        x: g.label.x,
        y: g.label.y,
        fill: theme.ref.label,
        size: 10,
        weight: 500,
        anchor: g.label.anchor,
        italic: true,
        content: escapeXml(g.group.name),
      }),
    );
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

/* ------------------------------------------------------------ sticky note */

/** The size of the folded corner at the bottom right of a sticky note. */
const NOTE_FOLD = 14;

/**
 * A sticky note (spec §19.6): a box in the note's color, or the theme's
 * default, with its bottom-right corner folded, holding the Markdown text
 * the layout broke into lines. With `color: none`, the text alone.
 */
function stickyNote (n: NoteLayout, theme: Theme): string {
  const { x, y, width: w, height: h } = n.bounds;
  const tn = theme.note;
  const fill = n.color ?? tn.fill;
  const ink = n.transparent ? tn.plainInk : readableInk(fill);
  const link = !n.transparent && ink !== 'white' ? tn.link : ink;
  const parts: string[] = ['<g>', `<title>${escapeXml(n.name)}</title>`];

  if (!n.transparent) {
    const r = 4;
    const f = NOTE_FOLD;
    parts.push(
      `<path d="M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - f} ` +
      `L ${x + w - f} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z" ` +
      `fill="${fill}" stroke="${tn.stroke}" stroke-width="1" filter="url(#entity-shadow)"/>`,
      `<path d="M ${x + w} ${y + h - f} L ${x + w - f} ${y + h - f} L ${x + w - f} ${y + h} Z" ` +
      `fill="${ink}" fill-opacity="0.14" stroke="${tn.stroke}" stroke-width="1" stroke-linejoin="round"/>`,
    );
  }

  const ox = x + NOTE_PADDING;
  const oy = y + NOTE_PADDING;
  for (const m of n.text.marks) {
    switch (m.kind) {
      case 'code':
        parts.push(`<rect x="${round(ox + m.x)}" y="${round(oy + m.y)}" width="${round(m.width)}" height="${round(m.height)}" rx="3" fill="${ink}" fill-opacity="0.08"/>`);
        break;
      case 'quote':
        parts.push(`<rect x="${round(ox + m.x)}" y="${round(oy + m.y)}" width="2.5" height="${round(m.height)}" rx="1" fill="${ink}" fill-opacity="0.35"/>`);
        break;
      case 'rule':
        parts.push(`<line x1="${round(ox + m.x)}" y1="${round(oy + m.y)}" x2="${round(ox + m.x + m.width)}" y2="${round(oy + m.y)}" stroke="${ink}" stroke-opacity="0.3" stroke-width="1"/>`);
        break;
      case 'marker':
        parts.push(text({ x: round(ox + m.x), y: round(oy + m.y), fill: ink, size: m.size, content: escapeXml(m.text) }));
        break;
    }
  }
  for (const line of n.text.lines) parts.push(noteLine(line, ox, oy, ink, link, theme));

  parts.push('</g>');
  return parts.join('');
}

function noteLine (line: NoteLine, ox: number, oy: number, ink: string, link: string, theme: Theme): string {
  if (line.runs.length === 0) return '';
  const attrs = [`x="${round(ox + line.x)}"`, `y="${round(oy + line.y)}"`, `fill="${ink}"`, `font-size="${line.size}"`];
  if (line.weight !== 400) attrs.push(`font-weight="${line.weight}"`);
  if (line.muted) attrs.push('fill-opacity="0.78"');
  if (line.mono) attrs.push(`font-family="${theme.fontMono}"`, 'xml:space="preserve"');
  const body = line.runs.map((r) => noteRun(r, line, ink, link, theme)).join('');
  return `<text ${attrs.join(' ')}>${body}</text>`;
}

function noteRun (r: NoteRun, line: NoteLine, ink: string, link: string, theme: Theme): string {
  const content = escapeXml(r.text);
  const attrs: string[] = [];
  if (r.strong && line.weight < 600) attrs.push('font-weight="600"');
  if (r.em) attrs.push('font-style="italic"');
  if (r.code && !line.mono) attrs.push(`font-family="${theme.fontMono}"`, `font-size="${line.size - 1}"`);
  const decorations = [r.href !== undefined ? 'underline' : '', r.strike ? 'line-through' : ''].filter(Boolean);
  if (decorations.length > 0) attrs.push(`text-decoration="${decorations.join(' ')}"`);
  if (r.href !== undefined && link !== ink) attrs.push(`fill="${link}"`);
  return attrs.length === 0 ? content : `<tspan ${attrs.join(' ')}>${content}</tspan>`;
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

interface Badge { label: string; color: string; wide?: boolean }

/**
 * Flag badges for a field row. The four relationship role markers of spec
 * 11.12 use their two-letter names (fk, fm, dk, dm) rather than initials,
 * so the diagram reads the same way as the spec table and as Hackolade
 * Studio; they render as pills rather than circles to fit the extra glyph.
 * A field carries every marker that applies to it, so an attribute that
 * parents both relationship kinds shows dk and dm side by side.
 */
function fieldBadges (field: FieldLayout, theme: Theme): Badge[] {
  const out: Badge[] = [];
  if (field.flags.pk) out.push({ label: 'P', color: theme.badges.pk });
  if (field.flags.fk) out.push({ label: 'fk', color: theme.badges.fk, wide: true });
  if (field.flags.fm) out.push({ label: 'fm', color: theme.badges.fm, wide: true });
  if (field.flags.dk) out.push({ label: 'dk', color: theme.badges.dk, wide: true });
  if (field.flags.dm) out.push({ label: 'dm', color: theme.badges.dm, wide: true });
  if (field.flags.unique && !field.flags.pk) out.push({ label: 'U', color: theme.badges.unique });
  // Members of a composite unique key (spec §10.2), numbered per key. Shown
  // on primary key fields too: membership in another key is information
  // the P badge does not carry.
  for (const n of field.flags.uniqueKeys ?? []) out.push({ label: `U${n}`, color: theme.badges.unique, wide: true });
  if (field.flags.notNull) out.push({ label: '!', color: theme.badges.notNull });
  return out;
}

/**
 * A small filled triangle pointing into the entity, used as the direction
 * marker on an entity-level relationship where no cardinality is stated.
 * Drawn in the same rotated frame the crow's foot glyphs use, so the
 * transform coming in already orients it to the side of the box.
 */
function directionArrow (color: string, transform: string): string {
  return `<g transform="${transform}"><path d="M 0 0 L 10 -5 L 10 5 Z" fill="${color}"/></g>`;
}

/* --------------------------------------------------------- text metrics */

/** Trim estimated coordinates to two decimals so goldens stay stable. */
function round (n: number): number {
  return Math.round(n * 100) / 100;
}

const BADGE_CIRCLE_W = 12;
const BADGE_PILL_W = 18;
const BADGE_GAP = 3;
const BADGE_NAME_GAP = 8;

function badgeWidth (b: Badge): number {
  return b.wide ? BADGE_PILL_W : BADGE_CIRCLE_W;
}

/**
 * Left edge of the first badge on a row: past the field name, plus a gap.
 * This is a left edge rather than a centre so a wide pill and a circle sit
 * the same distance from the name.
 */
function badgeLeft (field: FieldLayout): number {
  const nameStart = 12 + field.indent * INDENT_PX + 12;
  const nameWidth = measureText(field.name, 12, field.flags.pk ? 600 : 400);
  return nameStart + nameWidth + BADGE_NAME_GAP;
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
