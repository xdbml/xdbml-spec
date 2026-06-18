/**
 * Pure viewport math unit tests. Run: npm run test:viewport
 */
import process from 'node:process';
import {
  ZOOM_MIN, ZOOM_MAX, clampZoom, nextZoomLevel, prevZoomLevel,
  anchoredScroll, contentBox, computeFit, snapToGrid,
} from '../src/interactive/viewport.ts';

let passed = 0, failed = 0;
const fails: string[] = [];
const eq = (label: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) passed += 1;
  else { failed += 1; fails.push(`  FAIL: ${label} -- got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }
};
const ok = (label: string, c: boolean) => { if (c) passed += 1; else { failed += 1; fails.push(`  FAIL: ${label}`); } };

eq('clamp below min', clampZoom(0.01), ZOOM_MIN);
eq('clamp above max', clampZoom(99), ZOOM_MAX);
eq('clamp passthrough', clampZoom(1), 1);

eq('next from 1', nextZoomLevel(1), 1.25);
eq('next at max', nextZoomLevel(4), null);
eq('prev from 1', prevZoomLevel(1), 0.75);
eq('prev at min', prevZoomLevel(0.25), null);

// Anchored zoom: a point under the cursor stays put.
// At oldZoom=1, anchor (200,100), scroll (0,0): canvas point = (200,100).
// Zoom to 2 => newScroll = canvas*2 - anchor = (200, 100).
eq('anchored scroll keeps point fixed',
  anchoredScroll(1, 2, 200, 100, 0, 0), { scrollLeft: 200, scrollTop: 100 });
// Scroll never goes negative.
ok('anchored scroll clamps to >= 0',
  anchoredScroll(2, 1, 0, 0, 0, 0).scrollLeft >= 0);

// Content box.
eq('content box folds bounds',
  contentBox([], [{ bounds: { x: 10, y: 20, width: 100, height: 40 } }, { bounds: { x: 200, y: 5, width: 50, height: 50 } }]),
  { minX: 10, minY: 5, maxX: 250, maxY: 60 });
eq('content box empty', contentBox([], []), null);

// Fit: square-ish content in a big viewport uses strict fit, clamped to max.
{
  const box = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const fit = computeFit(box, 4000, 3000)!;
  ok('fit clamps to ZOOM_MAX for tiny content', fit.zoom === ZOOM_MAX);
}
// Fit: tall content (strict < 0.5) switches to fit-to-width capped at 0.75.
{
  const box = { minX: 0, minY: 0, maxX: 800, maxY: 8000 };
  const fit = computeFit(box, 1000, 600)!;
  ok('tall content uses fit-to-width <= 0.75', fit.zoom <= 0.75 && fit.zoom > 0);
}

eq('snap to grid', [snapToGrid(0), snapToGrid(9), snapToGrid(11), snapToGrid(31)], [0, 0, 20, 40]);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
console.log('All viewport-math checks passed.');
