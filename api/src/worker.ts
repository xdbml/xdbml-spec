/**
 * @xdbml/render-api -- a stateless HTTP service that renders xDBML source to
 * SVG, running as a Cloudflare Worker.
 *
 * The render path (parser -> layout -> serializer) is pure JavaScript, so the
 * Worker needs no Node.js compatibility flag and no headless browser: source
 * text comes in, an SVG string goes out, served from Cloudflare's edge.
 *
 * Endpoints
 *   GET  /            An in-browser tester (paste xDBML, see the diagram).
 *   GET  /health      Service metadata as JSON.
 *   GET  /render      Render a small/encoded schema from the `src` query
 *                     parameter; returns image/svg+xml so a browser draws it.
 *   POST /render      Render the request body (the primary path for real
 *   POST /            schemas). Body may be raw xDBML (text/plain) or JSON
 *                     of the form { "source": "...", "arrange": "...",
 *                     "background": "..." }.
 *
 * Options (query parameters, or JSON fields on a POST)
 *   arrange     relational (default) | star | none
 *   background  any CSS color for a solid background (default: transparent)
 */

import { renderToSVG, type ArrangeStrategy } from '@xdbml/render';

const VERSION = '0.1.0-poc.1';

/** Reject inputs larger than this (defends the edge against abuse). */
const MAX_SOURCE_BYTES = 256 * 1024;

interface RenderParams {
  arrange?: ArrangeStrategy | 'none';
  background?: string;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch (request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (method === 'GET' && pathname === '/') {
      return new Response(TESTER_HTML, {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (method === 'GET' && pathname === '/health') {
      return json({
        service: '@xdbml/render-api',
        version: VERSION,
        ok: true,
        endpoints: {
          'GET /': 'in-browser tester',
          'GET /health': 'this metadata',
          'GET /render?src=...': 'render a schema passed in the src query parameter',
          'POST /render': 'render the request body (text/plain xDBML or JSON {source,...})',
        },
        options: {
          arrange: ['relational (default)', 'star', 'none'],
          background: 'any CSS color (default: transparent)',
        },
        limits: { maxSourceBytes: MAX_SOURCE_BYTES, selfContainedDocumentsOnly: true },
      });
    }

    if (method === 'GET' && pathname === '/render') {
      const source = url.searchParams.get('src');
      if (source === null) {
        return error(
          'Provide xDBML via the `src` query parameter, or POST the document to /render.',
          400,
        );
      }
      return render(source, paramsFromQuery(url.searchParams));
    }

    if (method === 'POST' && (pathname === '/render' || pathname === '/')) {
      return handlePost(request, url);
    }

    return error(`Not found: ${method} ${pathname}`, 404);
  },
};

async function handlePost (request: Request, url: URL): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error('Request body is not valid JSON.', 400);
    }
    const obj = (body ?? {}) as Record<string, unknown>;
    const source = typeof obj.source === 'string' ? obj.source : '';
    if (source.trim() === '') {
      return error('JSON body must include a non-empty `source` string.', 400);
    }
    return render(source, paramsFromObject(obj, url.searchParams));
  }

  // Any other content type: treat the whole body as the xDBML document.
  const source = await request.text();
  if (source.trim() === '') {
    return error('Empty request body. Send the xDBML document as the body.', 400);
  }
  return render(source, paramsFromQuery(url.searchParams));
}

function render (source: string, params: RenderParams): Response {
  if (byteLength(source) > MAX_SOURCE_BYTES) {
    return error(`xDBML source exceeds the ${MAX_SOURCE_BYTES}-byte limit.`, 413);
  }

  let svg: string;
  try {
    svg = renderToSVG(source, {
      arrange: params.arrange,
      background: params.background,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(`Could not render xDBML: ${message}`, 400);
  }

  return new Response(svg, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

/* ------------------------------------------------------------ options */

function normalizeArrange (value: string | null | undefined): ArrangeStrategy | 'none' | undefined {
  if (value === 'relational' || value === 'star' || value === 'none') return value;
  return undefined; // renderToSVG defaults to 'relational'
}

function paramsFromQuery (params: URLSearchParams): RenderParams {
  return {
    arrange: normalizeArrange(params.get('arrange')),
    background: params.get('background') ?? params.get('bg') ?? undefined,
  };
}

function paramsFromObject (obj: Record<string, unknown>, params: URLSearchParams): RenderParams {
  const arrange = typeof obj.arrange === 'string' ? obj.arrange : params.get('arrange');
  const background = typeof obj.background === 'string'
    ? obj.background
    : (params.get('background') ?? params.get('bg') ?? undefined);
  return { arrange: normalizeArrange(arrange), background: background ?? undefined };
}

/* ------------------------------------------------------------ helpers */

function byteLength (s: string): number {
  return new TextEncoder().encode(s).length;
}

function json (body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function error (message: string, status: number): Response {
  return json({ error: message }, status);
}

/* ------------------------------------------------- in-browser tester */

const TESTER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>xDBML render API</title>
<style>
  :root { --blue:#2878b4; --ink:#1f2937; --line:#e5e7eb; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); }
  header { padding:14px 18px; border-bottom:1px solid var(--line); }
  header h1 { margin:0; font-size:16px; color:var(--blue); }
  header p { margin:2px 0 0; color:#6b7280; font-size:12px; }
  main { display:grid; grid-template-columns:minmax(280px,1fr) 1.4fr; gap:0; height:calc(100vh - 58px); }
  .pane { display:flex; flex-direction:column; min-width:0; }
  .pane.left { border-right:1px solid var(--line); }
  .bar { display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--line); }
  textarea { flex:1; border:0; padding:12px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; resize:none; outline:none; }
  select, button { font:13px system-ui,sans-serif; padding:5px 10px; border:1px solid var(--line); border-radius:6px; background:#fff; }
  button { background:var(--blue); color:#fff; border-color:var(--blue); cursor:pointer; }
  button:hover { filter:brightness(1.05); }
  label { color:#6b7280; font-size:12px; }
  .out { flex:1; overflow:auto; background:#f8fafc; padding:14px; }
  .out svg { max-width:100%; height:auto; }
  .err { color:#b91c1c; padding:14px; white-space:pre-wrap; font:13px ui-monospace,monospace; }
</style>
</head>
<body>
<header>
  <h1>xDBML render API</h1>
  <p>Paste an xDBML document, render it to SVG. Also callable directly: <code>POST /render</code> or <code>GET /render?src=...</code></p>
</header>
<main>
  <section class="pane left">
    <div class="bar">
      <label>Arrange</label>
      <select id="arrange">
        <option value="relational">relational</option>
        <option value="star">star</option>
        <option value="none">none</option>
      </select>
      <button id="render">Render</button>
    </div>
    <textarea id="src" spellcheck="false">xdbml: 0.3

Table users {
  id int [pk]
  email varchar [unique, not null]
  created_at timestamp
}

Table orders {
  id int [pk]
  user_id int [ref: > users.id]
  total decimal
  placed_at timestamp
}</textarea>
  </section>
  <section class="pane">
    <div class="bar"><label id="status">Ready</label></div>
    <div class="out" id="out"></div>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  async function run () {
    const src = $('src').value;
    const arrange = $('arrange').value;
    $('status').textContent = 'Rendering...';
    try {
      const res = await fetch('/render?arrange=' + encodeURIComponent(arrange), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: src,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        $('out').innerHTML = '<div class="err">' + (data.error || ('HTTP ' + res.status)) + '</div>';
        $('status').textContent = 'Error ' + res.status;
        return;
      }
      $('out').innerHTML = await res.text();
      $('status').textContent = 'OK';
    } catch (e) {
      $('out').innerHTML = '<div class="err">' + (e && e.message ? e.message : e) + '</div>';
      $('status').textContent = 'Network error';
    }
  }
  $('render').addEventListener('click', run);
  run();
</script>
</body>
</html>`;
