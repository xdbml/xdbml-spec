# @xdbml/mcp

A remote [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that exposes the xDBML core as tools, running as a stateless
Cloudflare Worker. It reuses the same `@xdbml/render` and `@xdbml/parse` paths
as the playground and the HTTP API, so an MCP client (Claude and others) can
render and validate xDBML natively as tool calls.

## The tools

### `render_xdbml`

```
render_xdbml(source, arrange?, background?, playground?, image?)
```

- `source` -- the xDBML (or DBML) document to render.
- `arrange` -- `relational` (default), `star`, or `none`.
- `background` -- optional CSS background color (default transparent).
- `playground` -- include the "Open in xDBML playground" link (default true).
- `image` -- `png` (default) or `none`; whether to include a PNG of the diagram.

It always returns a short summary (entity and relationship counts), the SVG as
an embedded resource, and a link that opens the schema in the interactive
playground. By default it also includes a PNG of the diagram; pass
`image: 'none'` to omit it. So the SVG is the exact, scalable source (always
present), the PNG is the raster the model can actually see (on by default), and
the choice is yours per call.

### A note on SVG vs PNG (and what each is for)

The original aim was an SVG, and you still get one: it is the exact, scalable
output, returned as a resource on every call. The PNG is not redundant. It is
the only form the model can *visually* read and reason over (it cannot "see" raw
SVG markup), and it is what shows in the tool-call panel for you. One honest
limit remains, and it is client-side, not something this server can fix:
Claude's API accepts tool image blocks only as `png`/`jpeg`/`gif`/`webp` (an SVG
image block is rejected outright), and even a PNG block is currently shown only
inside the collapsed tool-call panel, never inline in the reply. So neither
format renders inline in the chat bubble today; the PNG gives the model and you
a look, the SVG resource is the source of record, and the playground link is the
reliable way for a person to view and edit the diagram full-size. Use
`image: 'none'` when you only want the SVG and the link (and to save tokens).

### `validate_xdbml`

```
validate_xdbml(source)
```

- `source` -- the xDBML (or DBML) document to validate.

Validates a schema **without rendering it**: it runs only the parser and the
name resolver, so it is much cheaper than `render_xdbml`. It returns whether the
document is valid plus any errors or warnings with their line/column locations,
both as readable text and as a compact JSON tail an agent can parse. Syntax
errors (a missing bracket) and semantic ones (a foreign key pointing at an
entity that does not exist) are both reported. The point is a tight
author -> validate -> fix -> render loop: a model can check a draft, fix what it
flags, and only then pay to render.

## Endpoint

- `POST /mcp` -- the streamable-HTTP MCP endpoint (the default route).
- `GET /` -- a plain-text landing page describing the server.

## Deploy

```
cd mcp
npm install
npx wrangler login      # one-time
npm run deploy
```

Wrangler bundles and deploys the Worker, printing
`https://xdbml-mcp.<your-subdomain>.workers.dev`. The MCP endpoint is that URL
plus `/mcp` (for example `https://xdbml-mcp.xdbml.workers.dev/mcp`).

## Connect it in Claude

In Claude (claude.ai), open Settings, Connectors, Add custom connector, and
paste the `/mcp` URL. Claude then lists `render_xdbml` and `validate_xdbml` as
available tools and can call them during a conversation. For Claude Desktop or
any client that only speaks local stdio, bridge to the remote server with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

A typical use: ask Claude to design a schema, and it can write the xDBML,
validate it, call `render_xdbml`, and hand you a playground link to view and
refine it, all in one turn.

## Local development

```
npm run dev             # wrangler dev, serves http://localhost:8787
```

The MCP endpoint is `http://localhost:8787/mcp`. Test it with the
[MCP inspector](https://github.com/modelcontextprotocol/inspector) or any
remote-capable MCP client.

## Authentication

This server is currently authless (public): anyone with the URL can call the
render tool. That is acceptable here because the tool only renders a schema the
caller already supplies and returns no private data. If you later add tools
that touch private state, put it behind the Workers OAuth provider (the Agents
SDK integrates with it directly).

## Bundle size

PNG rasterization adds the resvg WASM module (~2.4 MB uncompressed) and the
bundled DejaVu Sans font (~0.7 MB). Combined with the MCP SDK this is
comfortable on a paid Workers plan (10 MB compressed) but can approach the free
plan's 3 MB compressed limit; `wrangler deploy` reports the compressed size. To
trim it, subset the font to the glyph ranges you expect (Latin plus arrows),
which can take it under ~100 KB, or pass `image: 'none'` per call.

## Scope and next steps

- The server is stateless: a fresh `McpServer` is created per request, which is
  required since MCP SDK 1.26.0 to prevent cross-client response leakage.
- It renders self-contained documents, the same boundary as the HTTP API;
  multi-file and remote `https://` imports need an async fetch-and-merge step
  first.
- Natural follow-ups: a matching `/validate` endpoint on the HTTP API for
  symmetry, and OAuth if non-public tools are added.
