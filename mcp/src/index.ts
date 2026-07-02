/**
 * @xdbml/mcp -- a remote Model Context Protocol (MCP) server that exposes the
 * xDBML render core as a tool, running as a stateless Cloudflare Worker.
 *
 * It reuses the same `@xdbml/render` path as the playground and the HTTP API,
 * so an MCP client (Claude and others) can work with an xDBML schema natively.
 * Three tools are exposed: `render_xdbml` (renders to SVG, plus a PNG by
 * default, and returns a playground link), `validate_xdbml` (render-free syntax
 * and reference checking with line/column diagnostics), and `xdbml_reference`
 * (a compact xDBML cheatsheet so the model authors xDBML, not plain DBML).
 * Server `instructions` reinforce the same xDBML-over-DBML grounding.
 *
 * Transport: streamable HTTP at `/mcp` (handled by `createMcpHandler`). The
 * server is stateless, so a fresh `McpServer` is created per request, required
 * since MCP SDK 1.26.0 to prevent cross-client response leakage.
 *
 * Inline images: Claude's API accepts tool image blocks only as
 * png/jpeg/gif/webp (an SVG image block is rejected), and even a PNG block is
 * currently shown only inside the collapsed tool-call panel, not inline. So
 * this tool returns the SVG as a resource plus a playground link rather than
 * an image block; the link is the reliable way to view and edit the diagram.
 * A rasterized PNG variant can be added later (see README).
 */

import { createMcpHandler } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { renderXdbmlTool, type RenderArgs } from './render-tool.js';
import { validateXdbmlTool, type ValidateArgs } from './validate-tool.js';
import { svgToPngBase64 } from './rasterize.js';
import { XDBML_REFERENCE } from './reference.js';

const SERVER_NAME = 'xdbml';
const SERVER_VERSION = '0.2.0';

/**
 * Server-level grounding shown to the model at initialize by clients that
 * surface MCP instructions. It steers the assistant toward xDBML rather than
 * the plain-DBML fallback, and points at the xdbml_reference tool and the
 * hosted cheatsheet for syntax.
 */
const SERVER_INSTRUCTIONS =
  'This server works with xDBML, a text markup language for data schemas and a ' +
  'strict superset of DBML 3.13.6. When a user asks you to design, draft, edit, ' +
  'or render a schema with these tools, author it in xDBML -- not plain DBML -- ' +
  'beginning with the line "xdbml: 0.3" and using xDBML constructs (Entity, ' +
  'nested objects and arrays, oneOf/union, reusable Type, precise min/max ' +
  'cardinality, Edge, View, and AI-readiness metadata such as tags, synonyms, ' +
  'and business_term) where they fit. If you are unsure of the syntax, call the ' +
  'xdbml_reference tool first, or read https://xdbml.org/llms.txt and ' +
  'https://xdbml.org/spec/v0.3. render_xdbml and validate_xdbml accept DBML too, ' +
  'since xDBML is a superset, but prefer xDBML.';

/** Build a fresh MCP server (per request, per the SDK 1.26.0 security model). */
function createServer (): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.tool(
    'render_xdbml',
    'Render an xDBML schema (an entity/relationship data model) to a diagram. ' +
      'Returns a short summary, a PNG image of the diagram, a link to open the ' +
      'schema in the interactive xDBML playground, and the SVG as a resource. ' +
      'Use this to visualize or sanity-check a data model. Author the schema in ' +
      'xDBML, a strict superset of DBML; plain DBML is accepted but prefer xDBML ' +
      'constructs. If unsure of the syntax, call xdbml_reference first.',
    {
      source: z.string().describe('The xDBML document to render. xDBML is a strict superset of DBML, so DBML is accepted, but prefer xDBML constructs.'),
      arrange: z
        .enum(['relational', 'star', 'none'])
        .optional()
        .describe('Auto-layout: relational (default), star (dimensional), or none (raw column layout).'),
      background: z
        .string()
        .optional()
        .describe('Optional CSS background color, e.g. "#ffffff". Default: transparent (light) or the dark canvas when mode is "dark".'),
      mode: z
        .enum(['light', 'dark'])
        .optional()
        .describe('Color theme. Default: light. Use "dark" for a dark-background diagram; the SVG and PNG both carry a matching dark backdrop so the light text stays legible.'),
      playground: z
        .boolean()
        .optional()
        .describe('Include the "Open in xDBML playground" link. Default: true.'),
      image: z
        .enum(['png', 'none'])
        .optional()
        .describe('Include a PNG of the diagram so the model can see it. Default: png.'),
    },
    async (args) => {
      const a = args as RenderArgs & { image?: 'png' | 'none' };
      const result = renderXdbmlTool(a);
      if (result.isError) return result;

      if (a.image !== 'none') {
        const resourceBlock = result.content.find((c) => c.type === 'resource');
        const svg = resourceBlock && resourceBlock.type === 'resource' ? resourceBlock.resource.text : undefined;
        if (svg) {
          try {
            const data = await svgToPngBase64(svg);
            // Put the image right after the summary so it is the first visual.
            result.content.splice(1, 0, { type: 'image', data, mimeType: 'image/png' });
          } catch {
            // Rasterization is best-effort; the SVG resource and link remain.
          }
        }
      }

      return result;
    },
  );

  server.tool(
    'validate_xdbml',
    'Validate an xDBML schema without rendering it (xDBML is a strict superset ' +
      'of DBML, so DBML is accepted). Checks syntax and resolves references, ' +
      'returning whether the document is valid plus any errors or warnings with ' +
      'their line/column locations. Much cheaper than render_xdbml; use it to ' +
      'catch typos or dangling references while authoring, then render once it ' +
      'is clean.',
    {
      source: z.string().describe('The xDBML document to validate. xDBML is a strict superset of DBML, so DBML is accepted.'),
    },
    async (args) => validateXdbmlTool(args as ValidateArgs),
  );

  server.tool(
    'xdbml_reference',
    'Return a compact xDBML reference: the version line, core constructs, field ' +
      'settings, relationships, nesting, polymorphism, edges, views, and ' +
      'AI-readiness metadata, with a minimal complete example. xDBML is a strict ' +
      'superset of DBML; call this BEFORE authoring a schema so you write ' +
      'idiomatic xDBML instead of falling back to plain DBML.',
    {},
    async () => ({ content: [{ type: 'text', text: XDBML_REFERENCE }] }),
  );

  return server;
}

const LANDING = `xDBML MCP server

This is a Model Context Protocol (MCP) server. Point an MCP client at the
streamable-HTTP endpoint:

  POST /mcp

Tools:
  render_xdbml(source, arrange?, background?, mode?, playground?, image?)
    Renders an xDBML schema to SVG (plus a PNG by default) and returns a
    playground link. xDBML is a strict superset of DBML.
  validate_xdbml(source)
    Validates an xDBML schema (syntax + reference resolution) and returns any
    errors or warnings with line/column locations. No rendering.
  xdbml_reference()
    Returns a compact xDBML cheatsheet so an assistant authors xDBML rather
    than falling back to plain DBML. Also at https://xdbml.org/llms.txt

To connect in Claude, add this server's /mcp URL as a custom connector.
`;

export default {
  async fetch (request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(LANDING, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const server = createServer();
    return createMcpHandler(server)(request, env, ctx);
  },
};
