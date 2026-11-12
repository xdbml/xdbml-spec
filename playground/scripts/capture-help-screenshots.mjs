// playground/scripts/capture-help-screenshots.mjs
//
// Takes the screenshots shown in the playground help pages and writes them
// to /playground/help/img/. Each help page includes its image with a
// regular Markdown image, such as ![...](./img/header-bar.png).
//
// Run it again when the playground's interface changes, so the help pages
// keep showing what the user sees:
//
//   1. In one terminal:   cd playground && npm run dev
//   2. In another:        cd playground && npm run help:screenshots
//
// To take only some of the images, pass their names without the extension:
//
//   npm run help:screenshots -- header-bar share-dropdown
//
// The script drives the Chrome installed on this computer through
// playwright-core, so no browser is downloaded. It opens the playground
// from the local dev server, in light mode, with an empty localStorage for
// each image. Set PLAYGROUND_ORIGIN when the dev server is not on
// http://localhost:5174.
//
// Each entry of `shots` below produces one image, named after its key.
// Entries find elements through the `data-*` attributes that
// /renderer/src/interactive/overlay.ts puts on the diagram, and through the
// titles of the toolbar buttons. When one of those changes, the entry
// fails with a timeout and its name is printed with FAIL.
//
// After a run, look at each image that changed before committing it. A
// label drawn by `callouts` can end up over the text it points at when the
// layout moves.
//
// Known limits:
//   - The Diagram menu is a native <select>, and a browser screenshot does
//     not include its open list. The image shows the menu closed, with a
//     diagram view chosen.
//   - The editor's hover tooltip on a parse error does not appear in the
//     automated browser, so editor-pane.png shows the squiggle alone.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import lz from 'lz-string';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ORIGIN = process.env.PLAYGROUND_ORIGIN ?? 'http://localhost:5174';
const BASE = `${ORIGIN}/playground/`;
const OUT = path.join(ROOT, 'playground/help/img');

try {
  await fetch(BASE);
} catch {
  console.error(`The playground is not running at ${BASE}. Start it with "npm run dev" in /playground/ and run this script again.`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

async function launch () {
  return chromium.launch({ channel: 'chrome', headless: true });
}

/**
 * Open the playground in a fresh context (empty localStorage) on an example.
 * `ls` seeds localStorage before the app starts.
 */
async function open (browser, { example = '02-ecommerce', width = 1440, height = 860, ls = {}, scale = 2 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: 'light',
  });
  await ctx.addInitScript((seed) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('xdbml-playground:appearance', 'light');
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }
  }, ls);
  const page = await ctx.newPage();
  await page.goto(`${BASE}?example=${example}`);
  await page.waitForSelector('.xdbml-canvas', { timeout: 20000 });
  await page.waitForSelector('.monaco-editor .view-line');
  await page.waitForTimeout(900);
  return page;
}

const toolbarButton = (page, title) => page.locator(`button[title^="${title}"]`);

async function fit (page) {
  await page.locator('button[title="Fit diagram to viewport"]').click();
  await page.waitForTimeout(400);
}

/** Replace the editor text, as a user paste would. */
async function setText (page, text) {
  await page.evaluate((t) => {
    const m = window.monaco?.editor?.getModels?.()[0];
    if (m) { m.setValue(t); return true; }
    return false;
  }, text);
}

/** Bounding box (CSS px) of the union of the given locators, with padding. */
async function unionBox (locators, pad = 12) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const l of locators) {
    const n = await l.count();
    for (let i = 0; i < n; i++) {
      const b = await l.nth(i).boundingBox();
      if (!b) continue;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    }
  }
  return { x: Math.max(0, x1 - pad), y: Math.max(0, y1 - pad), width: x2 - x1 + 2 * pad, height: y2 - y1 + 2 * pad };
}

/**
 * Draw numbered or text callouts over the page. Each: { x, y, text, tx, ty }
 * where (x, y) is the point referred to and (tx, ty) the label's top left.
 */
async function callouts (page, items) {
  await page.evaluate((items) => {
    document.getElementById('__callouts')?.remove();
    const root = document.createElement('div');
    root.id = '__callouts';
    root.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:Inter,system-ui,sans-serif';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0';
    root.appendChild(svg);
    document.body.appendChild(root);
    for (const it of items) {
      const lab = document.createElement('div');
      lab.textContent = it.text;
      lab.style.cssText = `position:absolute;left:${it.tx}px;top:${it.ty}px;background:#b45309;color:#fff;font-size:${it.size ?? 12}px;font-weight:600;line-height:1;padding:5px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      root.appendChild(lab);
      if (it.x == null) continue;
      const r = lab.getBoundingClientRect();
      // Leave from the label edge nearest the target.
      const cx = Math.max(r.left, Math.min(it.x, r.right));
      const cy = Math.max(r.top, Math.min(it.y, r.bottom));
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx); line.setAttribute('y1', cy);
      line.setAttribute('x2', it.x); line.setAttribute('y2', it.y);
      line.setAttribute('stroke', '#b45309'); line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', it.x); dot.setAttribute('cy', it.y); dot.setAttribute('r', '3.5');
      dot.setAttribute('fill', '#b45309');
      svg.appendChild(dot);
    }
  }, items);
}

/** Outline regions: { x, y, width, height, text }. */
async function regions (page, items) {
  await page.evaluate((items) => {
    document.getElementById('__regions')?.remove();
    const root = document.createElement('div');
    root.id = '__regions';
    root.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;font-family:Inter,system-ui,sans-serif';
    document.body.appendChild(root);
    for (const it of items) {
      const box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${it.x + 3}px;top:${it.y + 3}px;width:${it.width - 6}px;height:${it.height - 6}px;border:2px solid #b45309;border-radius:6px;box-sizing:border-box`;
      const lab = document.createElement('div');
      lab.textContent = it.text;
      lab.style.cssText = `position:absolute;${it.labelPos ?? 'left:8px;top:8px'};background:#b45309;color:#fff;font-size:14px;font-weight:600;line-height:1;padding:6px 10px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      box.appendChild(lab);
      root.appendChild(box);
    }
  }, items);
}

/** Draw a mouse pointer at (x, y); kind 'grab' draws a closed hand. */
async function fakeCursor (page, x, y, kind = 'arrow') {
  await page.evaluate(({ x, y, kind }) => {
    document.getElementById('__cursor')?.remove();
    const d = document.createElement('div');
    d.id = '__cursor';
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:100000;pointer-events:none`;
    d.innerHTML = kind === 'grab'
      ? '<svg width="26" height="26" viewBox="0 0 24 24" style="transform:translate(-12px,-10px)"><path d="M8 11V8.5a1.5 1.5 0 0 1 3 0V8a1.5 1.5 0 0 1 3 0v.5a1.5 1.5 0 0 1 3 0V10a1.5 1.5 0 0 1 3 0v5c0 4-2.5 6.5-6.5 6.5S7 19.5 6 17l-1.6-3.6A1.5 1.5 0 0 1 7 12l1 1.5Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l14 12h-7.5l4 8-3 1.5-4-8L4 20Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round" transform="scale(.85)"/></svg>';
    document.body.appendChild(d);
  }, { x, y, kind });
}

const browser = await launch();

const editor = (p) => p.locator('main > section').nth(0);
const diagram = (p) => p.locator('main > section').nth(1);
const inspector = (p) => p.locator('main > section').nth(2);
const diagnostics = (p) => p.locator('main ~ section');
const entity = (p, id) => [p.locator(`[data-handle="entity"][data-id="${id}"]`), p.locator(`[data-field][data-id="${id}"]`)];
const save = (p, name, clip) => p.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const box = async (l) => await l.boundingBox();

/** Load a whole document through a share link, as a shared URL does. */
async function loadText (p, text) {
  await p.goto(`${BASE}#s=${lz.compressToEncodedURIComponent(text)}`);
  await p.reload();
  await p.waitForSelector('.monaco-editor .view-line');
  await p.waitForTimeout(900);
}

/** Put the editor cursor at the end of a line and type. */
async function typeAtLine (p, line, text) {
  await p.locator('.monaco-editor .view-lines').click({ position: { x: 200, y: 10 } });
  await p.keyboard.press('Control+Home');
  for (let i = 1; i < line; i++) await p.keyboard.press('ArrowDown');
  await p.keyboard.press('End');
  await p.keyboard.type(text, { delay: 10 });
  await p.waitForTimeout(900);
}

const FIRST = `Project my_first {
  database_type: 'PostgreSQL'
  Note: 'A small example schema'
}

Table users {
  id        int     [pk, increment]
  email     varchar [unique, not null]
  full_name varchar
  created_at timestamp [default: \`now()\`]
}
`;

const content = (p) => [p.locator('[data-xdbml="container"]'), p.locator('[data-handle]'), p.locator('[data-field]')];
const oneToOne = async (p) => { await p.locator('button[title="Reset to 100%"]').click(); await p.waitForTimeout(500); };
const blogLine = (re) => fs.readFileSync(path.join(ROOT, 'examples/01-blog.xdbml'), 'utf8').split(/\r?\n/).findIndex((l) => re.test(l)) + 1;
const diagText = async (p) => (await diagnostics(p).innerText()).replace(/\s+/g, ' ').slice(0, 400);

const USERS = `Table users {
  id         int       [pk, increment]
  email      varchar   [unique, not null]
  full_name  varchar
  created_at timestamp [not null]
}
`;

const RELS = `Table authors {
  id    int     [pk]
  name  varchar [not null]
}

Table profiles {
  id        int [pk]
  author_id int [unique, not null]
  bio       varchar
}

Table posts {
  id        int     [pk]
  author_id int     [not null]
  title     varchar [not null]
}

Table tags {
  id    int     [pk]
  label varchar [unique, not null]
}

Ref: posts.author_id > authors.id [source: '0..*', target: '1..1']
Ref: profiles.author_id - authors.id [source: '0..1', target: '1..1']
Ref: posts.id <> tags.id [source: '0..*', target: '1..*']
`;

const NOTES = `xdbml: 0.7

Project shop {
  targets: [PostgreSQL]
}

Schema sales [target: PostgreSQL] {
  Table orders {
    id          int [pk]
    customer_id int [not null]
    status      varchar [not null]
    placed_at   timestamp
  }

  Table order_lines {
    order_id int [not null]
    sku      varchar [not null]
    quantity int [not null]
  }

  Note order_states [color: #BFDBFE] {
    '''
    **Status values**
    - placed
    - paid
    - shipped
    '''
  }
}

Table customers {
  id    int [pk]
  email varchar [unique, not null]
}

Ref: sales.order_lines.order_id > sales.orders.id
Ref: sales.orders.customer_id > customers.id

Note order_lifecycle [color: #FDE68A] {
  '''
  ## Order lifecycle
  An order is **placed**, then *paid*, then shipped.
  See the \`orders.status\` enum.
  '''
}
`;

const EMAIL_RE = /^\s*email\s/;

const shots = {
  async 'sixty-second-tour-full' () {
    const p = await open(browser);
    await p.locator('[data-handle="entity"][data-id="core.products"]').click();
    await p.waitForTimeout(500);
    await fit(p);
    await save(p, 'sixty-second-tour-full');
  },

  async 'layout-overview-annotated' () {
    const p = await open(browser);
    await p.locator('[data-handle="entity"][data-id="core.products"]').click();
    await p.waitForTimeout(500);
    await fit(p);
    const mid = 'left:50%;top:60%;transform:translate(-50%,-50%)';
    const center = 'left:50%;top:50%;transform:translate(-50%,-50%)';
    await regions(p, [
      { ...(await box(p.locator('header'))), text: 'Header bar', labelPos: center },
      { ...(await box(editor(p))), text: 'Editor pane', labelPos: mid },
      { ...(await box(diagram(p))), text: 'Diagram pane', labelPos: mid },
      { ...(await box(inspector(p))), text: 'Inspector pane', labelPos: mid },
      { ...(await box(diagnostics(p))), text: 'Diagnostics panel', labelPos: center },
    ]);
    await save(p, 'layout-overview-annotated');
  },

  async 'header-bar' () {
    const p = await open(browser, { width: 1180, height: 600 });
    await save(p, 'header-bar', { x: 0, y: 0, width: 1180, height: 57 });
  },

  async 'editor-pane' () {
    const p = await open(browser, { example: '01-blog', width: 1280, height: 720, ls: { 'xdbml-playground:editor-width': '760' } });
    await typeAtLine(p, blogLine(EMAIL_RE), ' 123456,');
    const sq = p.locator('.squiggly-error').first();
    await sq.waitFor();
    const b = await sq.boundingBox();
    await p.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2 - 20);
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await p.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2, { steps: 2 });
    await p.waitForSelector('.monaco-hover:not(.hidden)', { timeout: 5000 }).catch(() => console.log('  (no hover shown)'));
    await p.waitForTimeout(500);
    await save(p, 'editor-pane', await box(editor(p)));
  },

  async 'your-first-schema-single-table' () {
    const p = await open(browser, { width: 1180, height: 560, ls: { 'xdbml-playground:editor-width': '480' } });
    await loadText(p, FIRST);
    await oneToOne(p);
    await save(p, 'your-first-schema-single-table');
  },

  async 'examples-menu-open' () {
    const p = await open(browser, { width: 1180, height: 640 });
    await p.locator('header button', { hasText: 'Examples' }).click();
    await p.waitForTimeout(400);
    await save(p, 'examples-menu-open', { x: 640, y: 0, width: 540, height: 530 });
  },

  async 'share-dropdown' () {
    // Serve the local build under the public address, so the link reads as it does on xdbml.org.
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 640 }, deviceScaleFactor: 2, colorScheme: 'light' });
    await ctx.route('https://xdbml.org/**', async (route) => {
      const u = new URL(route.request().url());
      try {
        const r = await route.fetch({ url: `${ORIGIN}${u.pathname}${u.search}` });
        await route.fulfill({ response: r });
      } catch { await route.abort(); }
    });
    await ctx.addInitScript(() => localStorage.setItem('xdbml-playground:appearance', 'light'));
    const p = await ctx.newPage();
    await p.goto('https://xdbml.org/playground/?example=02-ecommerce');
    await p.waitForSelector('.xdbml-canvas');
    await p.waitForTimeout(900);
    await p.locator('header button', { hasText: 'Share' }).click();
    await p.waitForTimeout(400);
    await save(p, 'share-dropdown', { x: 640, y: 0, width: 540, height: 230 });
  },

  async 'diagram-pane' () {
    const p = await open(browser, { example: '01-blog', width: 1440, height: 640 });
    await p.locator('[data-handle="entity"][data-id="blog_app.posts"]').click();
    await p.waitForTimeout(500);
    await fit(p);
    await save(p, 'diagram-pane');
  },

  async 'diagram-pan-zoom-controls' () {
    const p = await open(browser, { example: '01-blog', width: 1280, height: 720 });
    await oneToOne(p);
    const bar = p.locator('button[title="Fit diagram to viewport"]').locator('xpath=..');
    const b = await bar.boundingBox();
    const targets = [
      ['Zoom out', bar.locator('button[title^="Zoom out"]')],
      ['Zoom level', bar.locator('input[type="text"]')],
      ['Zoom in', bar.locator('button[title^="Zoom in"]')],
      ['Fit', bar.locator('button[title="Fit diagram to viewport"]')],
      ['1:1', bar.locator('button[title="Reset to 100%"]')],
      ['Undo', bar.locator('button[title^="Undo"]')],
      ['Redo', bar.locator('button[title^="Redo"]')],
      ['Add a sticky note', bar.locator('button[title^="Add a sticky note"]')],
      ['Arrange', bar.locator('button[title="Auto-arrange the diagram"]')],
      ['Display', bar.locator('button[title^="Choose which"]')],
      ['Reset positions', bar.locator('button[title^="Reset repositioned"]')],
    ];
    const items = [];
    let i = 0;
    for (const [text, l] of targets) {
      if (!(await l.count())) continue;
      const r = await l.boundingBox();
      const x = r.x + r.width / 2;
      // Three rows of labels in turn, so neighbours do not overlap.
      items.push({ x, y: r.y + 4, text, tx: x - text.length * 3.3 - 8, ty: b.y - 34 - (i % 3) * 28, size: 11 });
      i++;
    }
    await callouts(p, items);
    const top = b.y - 104;
    await save(p, 'diagram-pan-zoom-controls', { x: b.x - 50, y: top, width: 1280 - (b.x - 50), height: b.y + b.height + 14 - top });
  },

  async 'diagram-drag-header' () {
    const p = await open(browser, { example: '01-blog', width: 1400, height: 620, ls: { 'xdbml-playground:editor-width': '280' } });
    await oneToOne(p);
    const h = await box(p.locator('[data-handle="entity"][data-id="blog_app.comments"]'));
    const sx = h.x + h.width / 2, sy = h.y + h.height / 2;
    await p.mouse.move(sx, sy);
    await p.mouse.down();
    await p.mouse.move(sx + 10, sy + 30, { steps: 5 });
    await p.mouse.move(sx + 40, sy + 170, { steps: 12 });
    await p.waitForTimeout(300);
    await fakeCursor(p, sx + 40, sy + 170, 'grab');
    await save(p, 'diagram-drag-header', await box(diagram(p)));
    await p.mouse.up();
  },

  async 'diagram-views-menu' () {
    const p = await open(browser, { example: '16-diagram-views', width: 1440, height: 800 });
    await p.locator('#diagram-view-select').selectOption('order_to_cash');
    await p.waitForTimeout(600);
    await fit(p);
    await save(p, 'diagram-views-menu', await box(diagram(p)));
  },

  async 'diagnostics-panel-errors' () {
    const p = await open(browser, { width: 1280, height: 720 });
    const src = fs.readFileSync(path.join(ROOT, 'examples/02-ecommerce.xdbml'), 'utf8');
    const bad = src
      .replace('shipping_address Address', 'shipping_address Adress')
      .replace('> core.customers.id', '> core.clients.id');
    await loadText(p, bad);
    console.log('  diagnostics:', await diagText(p));
    const d = await box(diagnostics(p));
    await save(p, 'diagnostics-panel-errors', { x: 0, y: d.y - 120, width: 1280, height: 720 - (d.y - 120) });
  },

  async 'inspector-pane-field' () {
    const p = await open(browser);
    await p.locator('[data-field="email"][data-id="core.customers"]').click();
    await p.waitForTimeout(500);
    await fit(p);
    await save(p, 'inspector-pane-field');
  },

  async 'entity-card-anatomy' () {
    const p = await open(browser, { width: 1400, height: 700, ls: { 'xdbml-playground:editor-width': '280' } });
    await loadText(p, USERS);
    await p.locator('input[title^="Zoom level"]').fill('150');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(500);
    const id = 'users';
    { const h = await box(p.locator(`[data-handle="entity"][data-id="${id}"]`));
      await p.mouse.move(h.x + 200, h.y + 10); await p.mouse.down();
      await p.mouse.move(h.x + 300, h.y + 30, { steps: 5 }); await p.mouse.move(h.x + 440, h.y + 70, { steps: 8 }); await p.mouse.up();
      await p.waitForTimeout(400); }
    const b = await unionBox(entity(p, id), 0);
    const rows = p.locator(`[data-field][data-id="${id}"]`);
    const r1 = await rows.nth(1).boundingBox();
    const r2 = await rows.nth(2).boundingBox();
    const r3 = await rows.nth(3).boundingBox();
    const hd = await box(p.locator(`[data-handle="entity"][data-id="${id}"]`));
    const L = b.x - 150, R = b.x + b.width + 50;
    await callouts(p, [
      { x: hd.x + 14, y: hd.y + hd.height / 2, text: 'Header band, with the entity name', tx: L - 110, ty: hd.y - 40 },
      { x: hd.x + hd.width - 10, y: hd.y + hd.height / 2, text: 'Keyword', tx: R, ty: hd.y + 10 },
      { x: r1.x + r1.width - 10, y: r1.y + r1.height / 2, text: 'Type', tx: R, ty: r1.y + 6 },
      { x: r2.x + 8, y: r2.y + r2.height / 2, text: 'Field row', tx: L, ty: r2.y + 6 },
      { x: r3.x + 160, y: r3.y + r3.height - 6, text: 'Badge', tx: r3.x + 130, ty: b.y + b.height + 34 },
      { x: b.x + b.width - 1, y: b.y + b.height - 14, text: 'Card outline', tx: R, ty: b.y + b.height + 10 },
    ]);
    await save(p, 'entity-card-anatomy', { x: b.x - 280, y: b.y - 60, width: b.width + 480, height: b.height + 140 });
  },

  async 'containers-example' () {
    const p = await open(browser, { width: 1700, height: 1400, ls: { 'xdbml-playground:editor-width': '280' } });
    await oneToOne(p);
    await save(p, 'containers-example', await unionBox(content(p), 24));
  },

  async 'nested-fields-expanded' () {
    const p = await open(browser, { width: 1500, height: 1400, ls: { 'xdbml-playground:editor-width': '280' } });
    await oneToOne(p);
    const id = 'orders_store.orders';
    await p.locator(`[data-handle="entity"][data-id="${id}"]`).scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    await save(p, 'nested-fields-expanded', await unionBox(entity(p, id), 16));
  },

  async 'relationships-overview' () {
    const p = await open(browser, { width: 2100, height: 700, ls: { 'xdbml-playground:editor-width': '280' } });
    await loadText(p, RELS);
    console.log('  diagnostics:', await diagText(p));
    await oneToOne(p);
    for (const id of ['profiles', 'authors', 'posts']) {
      const h = await box(p.locator(`[data-handle="entity"][data-id="${id}"]`));
      await p.mouse.move(h.x + 150, h.y + 10); await p.mouse.down();
      await p.mouse.move(h.x + 200, h.y + 10, { steps: 5 }); await p.mouse.move(h.x + 250, h.y + 10, { steps: 5 }); await p.mouse.up();
      await p.waitForTimeout(300);
    }
    await save(p, 'relationships-overview', await unionBox(content(p), 40));
  },

  async 'reading-the-diagram-overview' () {
    const p = await open(browser, { width: 1700, height: 1400, ls: { 'xdbml-playground:editor-width': '280' } });
    await oneToOne(p);
    const crop = await unionBox(content(p), 24);
    const cust = await unionBox(entity(p, 'core.customers'), 0);
    const prod = await unionBox(entity(p, 'core.products'), 0);
    const badge = await box(p.locator('[data-field="is_active"][data-id="core.products"]'));
    const caret = await box(p.locator('[data-caret][data-id="core.customers"][data-path="primary_address"]'));
    const ref = await box(p.locator('[data-ref="ref:1"]'));
    const core = await box(p.locator('[data-handle="container"][data-name="core"]'));
    const y1 = cust.y + cust.height + 80;      // below the core frame
    await callouts(p, [
      { x: caret.x + 1, y: caret.y + caret.height + 4, text: 'Nested fields', tx: cust.x - 10, ty: y1 },
      { x: core.x + core.width / 2 - 60, y: cust.y + cust.height + 24, text: 'Container', tx: core.x + core.width / 2 - 100, ty: y1 },
      { x: prod.x + 60, y: prod.y + prod.height, text: 'Entity card', tx: prod.x + 20, ty: prod.y + prod.height + 60 },
      { x: badge.x + 113, y: badge.y + badge.height - 4, text: 'Badges', tx: badge.x + 150, ty: prod.y + prod.height + 60 },
      { x: ref.x + ref.width / 2, y: ref.y + ref.height * 0.55, text: 'Relationship', tx: ref.x + ref.width / 2 - 170, ty: y1 },
    ]);
    await save(p, 'reading-the-diagram-overview', crop);
  },

  async 'supertype-groups-overview' () {
    const p = await open(browser, { example: '14-supertype-groups', width: 1700, height: 900, ls: { 'xdbml-playground:editor-width': '280' } });
    await p.locator('button[title^="Choose which"]').click();
    await p.locator('label', { hasText: 'Relationship names' }).locator('input').check();
    await p.locator('button[title^="Choose which"]').click();
    await p.waitForTimeout(300);
    await fit(p);
    await save(p, 'supertype-groups-overview', await unionBox(content(p), 16));
  },

  async 'sticky-notes-overview' () {
    const p = await open(browser, { width: 1400, height: 1100, ls: { 'xdbml-playground:editor-width': '280' } });
    await loadText(p, NOTES);
    await oneToOne(p);
    await save(p, 'sticky-notes-overview', await unionBox(content(p), 32));
  },

  async 'data-lineage-overview' () {
    const p = await open(browser, { example: '18-data-lineage', width: 1700, height: 1000, ls: { 'xdbml-playground:editor-width': '280' } });
    await fit(p);
    await save(p, 'data-lineage-overview', await unionBox(content(p), 28));
  },

  async 'when-parsing-fails-state' () {
    const p = await open(browser, { example: '01-blog', width: 1440, height: 800 });
    await fit(p);
    await typeAtLine(p, blogLine(EMAIL_RE), ' 123456,');
    await save(p, 'when-parsing-fails-state');
  },
};

const unknown = only.filter((n) => !(n in shots));
if (unknown.length) {
  console.error(`Unknown image name: ${unknown.join(', ')}`);
  await browser.close();
  process.exit(1);
}

let failed = false;
for (const [name, fn] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await fn();
    for (const c of browser.contexts()) await c.close();
    const kb = Math.round(fs.statSync(path.join(OUT, `${name}.png`)).size / 1024);
    console.log(`ok   ${name}  ${kb} KB`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}: ${String(e.message).split('\n')[0]}`);
    for (const c of browser.contexts()) await c.close();
  }
}
await browser.close();
if (failed) process.exit(1);
