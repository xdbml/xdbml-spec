/**
 * Interactive mount for xDBML diagrams.
 *
 * A framework-free, self-contained canvas: it renders the diagram (visible
 * shapes from the serializer, interaction layer from the overlay), and
 * handles selection, collapse/expand, entity/container/edge dragging, and
 * scroll-pan + anchored zoom. It is policy-free -- localStorage, undo/redo,
 * and document switching belong to the embedding shell, which subscribes to
 * the emitted events and drives the handle's imperative methods.
 *
 * The pan/zoom model matches the playground exactly: a scrolling viewport
 * whose inner <svg> is sized width*zoom by height*zoom over a fixed
 * viewBox; panning is native scroll, zooming rescales and re-anchors.
 */
import { parse, flatten } from '@xdbml/parse';
import type { XDbmlDocument } from '@xdbml/parse';

import {
  applyUserPositions,
  buildDiagram,
  makeCollapsedKey,
  type DiagramModel,
  type EdgeOffsets,
  type UserPositions,
} from '../layout/layout.ts';
import { autoArrange, type ArrangeStrategy } from '../layout/auto-arrange.ts';
import { serializeDiagram } from '../svg/serialize.ts';
import type { DeepPartial, Theme } from '../style/theme.ts';
import { buildOverlay, type Selection } from './overlay.ts';
import {
  anchoredScroll,
  clampZoom,
  computeFit,
  contentBox,
  nextZoomLevel,
  prevZoomLevel,
  snapToGrid,
} from './viewport.ts';

export type MountInput = string | XDbmlDocument;

export interface LayoutState {
  positions: Record<string, { x: number; y: number }>;
  offsets: Record<string, { dx: number; dy: number }>;
  collapsed: string[];
  zoom: number;
}

export interface MountOptions {
  theme?: DeepPartial<Theme>;
  background?: string;
  /** Initial automatic arrangement when no positions are restored. Default 'relational'. */
  arrange?: ArrangeStrategy;
  /** Fired when the selection changes (entity/field/ref/container or null). */
  onSelect?: (selection: Selection) => void;
  /** Fired after a position/offset change settles (drag drop, arrange, reset). */
  onChange?: (state: LayoutState) => void;
  /** Fired when collapse state changes (kept separate from position history). */
  onCollapseChange?: (collapsed: string[]) => void;
  /** Fired when the zoom level changes. */
  onZoom?: (zoom: number) => void;
}

export interface DiagramHandle {
  setInput (input: MountInput): void;
  getModel (): DiagramModel;
  getState (): LayoutState;
  setState (state: Partial<LayoutState>): void;
  toggleCollapse (entityId: string, path: string): void;
  setCollapsed (collapsed: Iterable<string>): void;
  arrange (strategy: ArrangeStrategy): void;
  reset (): void;
  select (selection: Selection): void;
  getSelection (): Selection;
  getZoom (): number;
  setZoom (zoom: number, anchorX?: number, anchorY?: number): void;
  zoomIn (): void;
  zoomOut (): void;
  zoomToFit (): void;
  destroy (): void;
}

const DRAG_THRESHOLD = 2;

export function mount (target: HTMLElement, input: MountInput, options: MountOptions = {}): DiagramHandle {
  const doc0 = typeof input === 'string' ? flatten(parse(input)) : flatten(input);

  // ---- state ----
  let doc: XDbmlDocument = doc0;
  let collapsed = new Set<string>();
  let positions: UserPositions = new Map();
  let offsets: EdgeOffsets = new Map();
  let zoom = 1;
  let selection: Selection = null;
  let model: DiagramModel = buildDiagram(doc, collapsed);

  // ---- DOM scaffold ----
  const viewport = target.ownerDocument.createElement('div');
  viewport.className = 'xdbml-viewport';
  viewport.style.cssText =
    'position:relative;width:100%;height:100%;overflow:auto;' +
    'background-color:#f8fafc;' +
    'background-image:linear-gradient(#eef2f7 1px,transparent 1px),linear-gradient(90deg,#eef2f7 1px,transparent 1px);' +
    'background-size:20px 20px;';
  target.appendChild(viewport);
  let svgEl: SVGSVGElement | null = null;

  // Initial arrangement (unless the caller restores positions via setState).
  recomputeModel();
  applyArrange(options.arrange ?? 'relational', false);
  render();

  /* --------------------------------------------------------- rendering */

  function recomputeModel (): void {
    const base = buildDiagram(doc, collapsed);
    model = (positions.size > 0 || offsets.size > 0)
      ? applyUserPositions(base, positions, offsets)
      : base;
  }

  function render (): void {
    const shapes = serializeDiagram(model, {
      inner: true,
      collapsedPaths: collapsed,
      theme: options.theme,
      selectedField: selection && selection.kind === 'field'
        ? { entityId: selection.id, path: selection.path }
        : undefined,
    });
    const overlay = buildOverlay(model, selection);
    const w = model.width * zoom;
    const h = model.height * zoom;
    viewport.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" class="xdbml-canvas" ` +
      `width="${w}" height="${h}" viewBox="0 0 ${model.width} ${model.height}" ` +
      `style="display:block">${shapes}${overlay}</svg>`;
    svgEl = viewport.querySelector('svg');
  }

  function resize (): void {
    if (!svgEl) return;
    svgEl.setAttribute('width', String(model.width * zoom));
    svgEl.setAttribute('height', String(model.height * zoom));
  }

  /* -------------------------------------------------------- selection */

  function setSelection (sel: Selection, emit = true): void {
    selection = sel;
    render();
    if (emit) options.onSelect?.(sel);
  }

  /* --------------------------------------------------------- collapse */

  function toggle (entityId: string, path: string): void {
    const key = makeCollapsedKey(entityId, path);
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key); else next.add(key);
    collapsed = next;
    recomputeModel();
    render();
    options.onCollapseChange?.([...collapsed]);
  }

  /* --------------------------------------------------- arrange / reset */

  function applyArrange (strategy: ArrangeStrategy, emit: boolean): void {
    const base = buildDiagram(doc, collapsed);
    positions = new Map(autoArrange(base, strategy));
    recomputeModel();
    render();
    if (emit) emitChange();
  }

  function reset (): void {
    positions = new Map();
    offsets = new Map();
    recomputeModel();
    render();
    emitChange();
  }

  function emitChange (): void {
    options.onChange?.(currentState());
  }

  function currentState (): LayoutState {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of positions) pos[id] = { x: p.x, y: p.y };
    const off: Record<string, { dx: number; dy: number }> = {};
    for (const [id, o] of offsets) off[id] = { dx: o.dx, dy: o.dy };
    return { positions: pos, offsets: off, collapsed: [...collapsed], zoom };
  }

  /* ------------------------------------------------------------- zoom */

  function setZoom (target_: number, anchorX?: number, anchorY?: number): void {
    const clamped = clampZoom(target_);
    const rect = viewport.getBoundingClientRect();
    const ax = anchorX !== undefined ? anchorX : rect.width / 2;
    const ay = anchorY !== undefined ? anchorY : rect.height / 2;
    const scroll = anchoredScroll(zoom, clamped, ax, ay, viewport.scrollLeft, viewport.scrollTop);
    zoom = clamped;
    resize();
    viewport.scrollLeft = scroll.scrollLeft;
    viewport.scrollTop = scroll.scrollTop;
    options.onZoom?.(zoom);
  }

  function zoomToFit (): void {
    const box = contentBox(model.containers, model.entities);
    if (!box) return;
    const rect = viewport.getBoundingClientRect();
    const fit = computeFit(box, rect.width, rect.height);
    if (!fit) return;
    zoom = fit.zoom;
    resize();
    viewport.scrollLeft = fit.scrollLeft;
    viewport.scrollTop = fit.scrollTop;
    options.onZoom?.(zoom);
  }

  /* -------------------------------------------------- pointer handlers */

  type Drag =
    | { kind: 'entity'; id: string; sx: number; sy: number; cx: number; cy: number; z: number; moved: boolean }
    | { kind: 'edge'; id: string; sx: number; sy: number; cx: number; cy: number; z: number; moved: boolean }
    | { kind: 'container'; name: string; starts: Map<string, { x: number; y: number }>; cx: number; cy: number; z: number; moved: boolean };
  let drag: Drag | null = null;

  function onMouseDown (e: MouseEvent): void {
    const el = (e.target as Element | null)?.closest('[data-handle]') as Element | null;
    if (!el) return;
    const handle = el.getAttribute('data-handle');
    e.preventDefault();

    if (handle === 'container') {
      const name = el.getAttribute('data-name') ?? '';
      const starts = new Map<string, { x: number; y: number }>();
      for (const ent of model.entities) {
        if (ent.containerName === name) starts.set(ent.id, { x: ent.bounds.x, y: ent.bounds.y });
      }
      drag = { kind: 'container', name, starts, cx: e.clientX, cy: e.clientY, z: zoom, moved: false };
    } else {
      const id = el.getAttribute('data-id') ?? '';
      if (handle === 'edge') {
        const cur = offsets.get(id) ?? { dx: 0, dy: 0 };
        drag = { kind: 'edge', id, sx: cur.dx, sy: cur.dy, cx: e.clientX, cy: e.clientY, z: zoom, moved: false };
      } else {
        const ent = model.entities.find((x) => x.id === id) ?? model.edges.map((m) => m.box).find((b) => b.id === id);
        if (!ent) return;
        drag = { kind: 'entity', id, sx: ent.bounds.x, sy: ent.bounds.y, cx: e.clientX, cy: e.clientY, z: zoom, moved: false };
      }
    }

    const ownerDoc = target.ownerDocument;
    ownerDoc.addEventListener('mousemove', onMouseMove);
    ownerDoc.addEventListener('mouseup', onMouseUp);
    ownerDoc.body.style.userSelect = 'none';
  }

  function onMouseMove (e: MouseEvent): void {
    if (!drag) return;
    const dxPx = e.clientX - drag.cx;
    const dyPx = e.clientY - drag.cy;
    if (!drag.moved && Math.abs(dxPx) < DRAG_THRESHOLD && Math.abs(dyPx) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const dxSvg = dxPx / drag.z;
    const dySvg = dyPx / drag.z;

    if (drag.kind === 'entity') {
      const next = new Map(positions);
      next.set(drag.id, { x: Math.max(0, drag.sx + dxSvg), y: Math.max(0, drag.sy + dySvg) });
      positions = next;
    } else if (drag.kind === 'edge') {
      const next = new Map(offsets);
      next.set(drag.id, { dx: drag.sx + dxSvg, dy: drag.sy + dySvg });
      offsets = next;
    } else {
      const next = new Map(positions);
      for (const [id, s] of drag.starts) {
        next.set(id, { x: Math.max(0, s.x + dxSvg), y: Math.max(0, s.y + dySvg) });
      }
      positions = next;
    }
    recomputeModel();
    render();
  }

  function onMouseUp (): void {
    const ownerDoc = target.ownerDocument;
    ownerDoc.removeEventListener('mousemove', onMouseMove);
    ownerDoc.removeEventListener('mouseup', onMouseUp);
    ownerDoc.body.style.userSelect = '';
    const d = drag;
    drag = null;
    if (!d) return;

    if (d.moved) {
      if (d.kind === 'entity') {
        const cur = positions.get(d.id);
        if (cur) {
          const next = new Map(positions);
          next.set(d.id, { x: snapToGrid(cur.x), y: snapToGrid(cur.y) });
          positions = next;
        }
      } else if (d.kind === 'edge') {
        const cur = offsets.get(d.id);
        if (cur) {
          const next = new Map(offsets);
          next.set(d.id, { dx: snapToGrid(cur.dx), dy: snapToGrid(cur.dy) });
          offsets = next;
        }
      } else {
        const next = new Map(positions);
        for (const id of d.starts.keys()) {
          const cur = next.get(id);
          if (cur) next.set(id, { x: snapToGrid(cur.x), y: snapToGrid(cur.y) });
        }
        positions = next;
      }
      recomputeModel();
      render();
      emitChange();
    } else {
      // No movement: a press on a handle selects.
      if (d.kind === 'container') setSelection({ kind: 'container', name: d.name });
      else setSelection({ kind: 'entity', id: d.id });
    }
  }

  function onClick (e: MouseEvent): void {
    const t = e.target as Element | null;
    if (!t) return;
    const caret = t.closest('[data-caret]');
    if (caret) {
      toggle(caret.getAttribute('data-id') ?? '', caret.getAttribute('data-path') ?? '');
      return;
    }
    const field = t.closest('[data-field]');
    if (field) {
      setSelection({ kind: 'field', id: field.getAttribute('data-id') ?? '', path: field.getAttribute('data-field') ?? '' });
      return;
    }
    const ref = t.closest('[data-ref]');
    if (ref) { setSelection({ kind: 'ref', id: ref.getAttribute('data-ref') ?? '' }); return; }
    const cont = t.closest('[data-select-container]');
    if (cont) { setSelection({ kind: 'container', name: cont.getAttribute('data-select-container') ?? '' }); return; }
    // Clicking a drag handle is handled by mousedown/up; bare canvas clears.
    if (!t.closest('[data-handle]')) setSelection(null);
  }

  function onWheel (e: WheelEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return; // plain wheel = native scroll
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015); // smooth multiplicative step
    setZoom(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  viewport.addEventListener('mousedown', onMouseDown);
  viewport.addEventListener('click', onClick);
  viewport.addEventListener('wheel', onWheel, { passive: false });

  /* ----------------------------------------------------------- handle */

  return {
    setInput (next: MountInput): void {
      doc = typeof next === 'string' ? flatten(parse(next)) : flatten(next);
      // A content change preserves the current layout and selection: only a
      // fresh document with no positions falls back to auto-arrange. The
      // embedding shell drives explicit re-layout on a real document switch
      // (via setState / arrange).
      if (positions.size === 0 && offsets.size === 0) {
        applyArrange(options.arrange ?? 'relational', false);
      } else {
        recomputeModel();
        render();
      }
    },
    getModel: () => model,
    getState: currentState,
    setState (state: Partial<LayoutState>): void {
      if (state.positions) {
        positions = new Map(Object.entries(state.positions).map(([id, p]) => [id, { x: p.x, y: p.y }]));
      }
      if (state.offsets) {
        offsets = new Map(Object.entries(state.offsets).map(([id, o]) => [id, { dx: o.dx, dy: o.dy }]));
      }
      if (state.collapsed) collapsed = new Set(state.collapsed);
      if (state.zoom !== undefined) zoom = clampZoom(state.zoom);
      recomputeModel();
      render();
    },
    toggleCollapse: toggle,
    setCollapsed (next: Iterable<string>): void {
      collapsed = new Set(next);
      recomputeModel();
      render();
    },
    arrange: (strategy) => applyArrange(strategy, true),
    reset,
    select: (sel: Selection) => setSelection(sel, false),
    getSelection: () => selection,
    getZoom: () => zoom,
    setZoom,
    zoomIn (): void { const n = nextZoomLevel(zoom); if (n !== null) setZoom(n); },
    zoomOut (): void { const p = prevZoomLevel(zoom); if (p !== null) setZoom(p); },
    zoomToFit,
    destroy (): void {
      viewport.removeEventListener('mousedown', onMouseDown);
      viewport.removeEventListener('click', onClick);
      viewport.removeEventListener('wheel', onWheel);
      const ownerDoc = target.ownerDocument;
      ownerDoc.removeEventListener('mousemove', onMouseMove);
      ownerDoc.removeEventListener('mouseup', onMouseUp);
      viewport.remove();
    },
  };
}
