/**
 * Interactive mount validation (jsdom).
 *
 * Drives the mount through synthetic DOM events and asserts the resulting
 * state transitions, emitted events, and re-rendered overlay. Pan/zoom
 * *feel* (scroll anchoring against a real viewport) can't be exercised in
 * jsdom -- getBoundingClientRect returns zeros -- so the zoom math is unit
 * tested separately in run-viewport-tests.ts; here we assert the wiring
 * (svg resizes, onZoom fires, discrete steps).
 *
 * Run: npm run test:interactive
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', '..', 'examples', '02-ecommerce.xdbml'), 'utf8');

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check (label: string, cond: boolean, detail = ''): void {
  if (cond) passed += 1;
  else { failed += 1; failures.push(`  FAIL: ${label}${detail ? ` -- ${detail}` : ''}`); }
}

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
const { window } = dom;
// Make DOM globals visible to the mount module (it uses MouseEvent etc. via
// the target's ownerDocument, but document.body.style needs a global doc).
(globalThis as Record<string, unknown>).window = window;
(globalThis as Record<string, unknown>).document = window.document;
(globalThis as Record<string, unknown>).MouseEvent = window.MouseEvent;
(globalThis as Record<string, unknown>).WheelEvent = window.WheelEvent;

const { mount } = await import('../src/interactive/index.ts');

const host = window.document.getElementById('host')!;

let lastSelect: unknown = 'unset';
let changeCount = 0;
let lastCollapsed: string[] | null = null;
let lastZoom = -1;

const handle = mount(host, source, {
  onSelect: (s) => { lastSelect = s; },
  onChange: () => { changeCount += 1; },
  onCollapseChange: (c) => { lastCollapsed = c; },
  onZoom: (z) => { lastZoom = z; },
});

const svg = () => host.querySelector('svg')!;
const q = (sel: string) => svg().querySelectorAll(sel);

// ---- render ----
check('svg mounted', !!host.querySelector('svg'));
const model = handle.getModel();
check('entity overlay groups match model',
  q('[data-xdbml="entity"]').length === model.entities.length,
  `dom=${q('[data-xdbml="entity"]').length} model=${model.entities.length}`);
check('field hit areas present', q('[data-field]').length > 0);

function fire (el: Element, type: string, init: Record<string, unknown> = {}): void {
  el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}
function fireDoc (type: string, init: Record<string, unknown> = {}): void {
  window.document.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

// ---- selection: click a field row ----
const field = q('[data-field]')[0];
fire(field, 'click');
check('field click emits field selection',
  !!lastSelect && (lastSelect as { kind: string }).kind === 'field',
  JSON.stringify(lastSelect));
check('field selection highlight rendered', svg().innerHTML.includes('#dbeafe'));

// ---- selection: click a ref ----
const ref = q('[data-ref]')[0];
if (ref) {
  fire(ref, 'click');
  check('ref click emits ref selection', !!lastSelect && (lastSelect as { kind: string }).kind === 'ref');
}

// ---- clear selection on bare canvas click ----
fire(svg(), 'click');
check('bare click clears selection', lastSelect === null);

// ---- collapse: click a caret ----
const caretsBefore = q('[data-caret]').length;
check('a caret exists to toggle', caretsBefore > 0, `carets=${caretsBefore}`);
if (caretsBefore > 0) {
  const rowsBefore = handle.getModel().entities.reduce((n, e) => n + e.fields.length, 0);
  fire(q('[data-caret]')[0], 'click');
  const rowsAfter = handle.getModel().entities.reduce((n, e) => n + e.fields.length, 0);
  check('caret click emits collapse change', ((lastCollapsed as string[] | null)?.length ?? -1) === 1);
  check('caret click removes child rows', rowsAfter < rowsBefore, `before=${rowsBefore} after=${rowsAfter}`);
  // toggle back
  fire(q('[data-caret]')[0], 'click');
  check('caret toggles back', handle.getModel().entities.reduce((n, e) => n + e.fields.length, 0) === rowsBefore);
}

// ---- entity drag ----
const handleRect = q('[data-handle="entity"]')[0];
const draggedId = handleRect.getAttribute('data-id')!;
const changeBefore = changeCount;
fire(handleRect, 'mousedown', { clientX: 100, clientY: 100 });
fireDoc('mousemove', { clientX: 137, clientY: 151 }); // >2px, dx=37 dy=51 at zoom 1
fireDoc('mouseup', { clientX: 137, clientY: 151 });
const st = handle.getState();
check('entity drag recorded a position', !!st.positions[draggedId], `ids=${Object.keys(st.positions).length}`);
check('entity drag emitted onChange', changeCount === changeBefore + 1);
if (st.positions[draggedId]) {
  const p = st.positions[draggedId];
  check('dropped position snapped to grid', p.x % 20 === 0 && p.y % 20 === 0, `x=${p.x} y=${p.y}`);
}

// ---- no-move press selects entity ----
lastSelect = 'unset';
fire(q('[data-handle="entity"]')[0], 'mousedown', { clientX: 50, clientY: 50 });
fireDoc('mouseup', { clientX: 50, clientY: 50 });
check('no-move press selects entity', !!lastSelect && (lastSelect as { kind: string }).kind === 'entity');

// ---- zoom wiring ----
const w1 = Number(svg().getAttribute('width'));
handle.setZoom(2);
const w2 = Number(svg().getAttribute('width'));
check('setZoom resizes svg width', Math.abs(w2 - w1 * 2) < 1e-6, `w1=${w1} w2=${w2}`);
check('setZoom emits onZoom', Math.abs(lastZoom - 2) < 1e-6);
handle.setZoom(1);
handle.zoomIn();
check('zoomIn steps to a discrete level', handle.getZoom() === 1.25, `zoom=${handle.getZoom()}`);
handle.zoomOut();
check('zoomOut steps back', handle.getZoom() === 1);

// ---- arrange / reset ----
handle.arrange('star');
check('arrange populates positions', Object.keys(handle.getState().positions).length > 0);
handle.reset();
check('reset clears positions', Object.keys(handle.getState().positions).length === 0);

// ---- state round-trip ----
handle.arrange('relational');
const saved = handle.getState();
handle.reset();
handle.setState(saved);
const restored = handle.getState();
check('getState/setState positions round-trip',
  JSON.stringify(restored.positions) === JSON.stringify(saved.positions));

// ---- destroy ----
handle.destroy();
check('destroy removes the viewport', !host.querySelector('svg'));

// ---- report ----
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
console.log('All interactive-mount checks passed.');
