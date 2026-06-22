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

## Connect it in ChatGPT

ChatGPT reaches a custom MCP server through Developer Mode, available on the
Plus, Pro, Business, Enterprise, and Edu plans (not Free) and only for remote
HTTPS servers, which this one is. Open Settings, then Apps (older builds call
this Connectors), then Advanced settings, and turn on Developer mode; on
Business and Enterprise a workspace admin enables it first. Create a custom
connector pointing at the `/mcp` URL with no authentication, and ChatGPT lists
`render_xdbml` and `validate_xdbml`, which you enable per chat from the
composer's Developer Mode menu. ChatGPT treats a tool without a `readOnlyHint`
annotation as a write action and asks you to confirm each call; both tools here
are read-only, so annotating them with `readOnlyHint: true` removes the prompt.
For a published custom GPT rather than a personal connector, point an Action at
the HTTP render API instead (see [`../api/README.md`](../api/README.md)).

## Connect it in GitHub Copilot

GitHub Copilot uses MCP servers in agent mode. In VS Code 1.99 or later, add the
server to `.vscode/mcp.json` in a repository, or to your user configuration via
the Command Palette ("MCP: Open User Configuration"). The root key is `servers`,
not the `mcpServers` that Cursor and Claude Desktop use:

```json
{
  "servers": {
    "xdbml": { "type": "http", "url": "https://xdbml-mcp.xdbml.workers.dev/mcp" }
  }
}
```

Click Start above the entry, open Copilot Chat, and switch the mode to Agent;
MCP tools are hidden in Ask and Edit mode. Copilot then offers `render_xdbml`
and `validate_xdbml` and asks you to Allow each call. The same server works from
Visual Studio 2022 (17.14 or later) and 2026 via a `.mcp.json` entry, from the
Copilot CLI via `~/.copilot/mcp-config.json`, and from the Copilot cloud agent
and code review via repository-level MCP configuration. On Copilot Business and
Enterprise, an admin must first enable the "MCP servers in Copilot" policy,
which is off by default.

## Connect it in Mistral Le Chat

Le Chat is an MCP client and accepts any remote MCP server. Open the Connectors
page, click Add Connector, switch to the Custom MCP Connector tab, give it a
name (no spaces), paste the `/mcp` URL, and choose No authentication. Le Chat
runs the MCP handshake, lists `render_xdbml` and `validate_xdbml`, and makes them
available in chats; you can leave tool calls on manual approval or mark a tool
Always allow. In an organization an administrator controls which connectors are
available, and plan availability for custom connectors has shifted over time, so
check Mistral's current terms.

## Connect it in Grok

Grok (xAI) supports custom MCP servers, which it calls "bring your own MCP," on
its paid plans. Go to grok.com/connectors, click New Connector, choose Custom,
and enter the `/mcp` URL (the server must be reachable on the public internet,
which this one is). Grok discovers the tools and uses them in conversations like
its built-in connectors. For programmatic use, the xAI API also accepts remote
MCP tools: pass `{ "type": "mcp", "server_url":
"https://xdbml-mcp.xdbml.workers.dev/mcp", "server_label": "xdbml" }` in the
request's `tools` array.

## Connect it in Gemini

Google's consumer Gemini app does not currently let you add a custom MCP server.
The paths that do work are the Gemini CLI (now folding into Google's Antigravity
CLI), where you add the server to the `mcpServers` map in
`~/.gemini/settings.json` using `httpUrl` for the streamable-HTTP endpoint;
Gemini Enterprise, where an administrator registers it as a custom MCP data
store; and the Gemini API, whose function-calling and MCP support let your own
agent call the tools. For a quick one-off in the consumer app, fall back to the
HTTP render API.

## Connect it in Meta AI

Meta's consumer AI assistant does not act as an MCP client, so there is no
connector to add there. With Llama models you can still reach the server by
running an MCP client around them (Llama Stack, LlamaIndex, LocalAI, or your own
code using the Llama API's tool calling), or you can skip MCP entirely and call
the HTTP render API, which any agent that makes web requests can use.

The note above on inline rendering applies to every assistant here: each receives
the SVG and PNG as a tool result and reasons over the PNG, but neither renders
inline in the reply, so the playground link is the reliable way for a person to
open and edit the diagram.

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
