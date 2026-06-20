/**
 * @xdbml/mcp -- a remote Model Context Protocol (MCP) server that exposes the
 * xDBML render core as a tool, running as a stateless Cloudflare Worker.
 *
 * It reuses the same `@xdbml/render` path as the playground and the HTTP API,
 * so an MCP client (Claude and others) can work with an xDBML schema natively.
 * Two tools are exposed: `render_xdbml` (renders to SVG, plus a PNG by default,
 * and returns a playground link) and `validate_xdbml` (render-free syntax and
 * reference checking with line/column diagnostics).
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

const SERVER_NAME = 'xdbml';
const SERVER_VERSION = '0.1.0-poc.3';

/** Build a fresh MCP server (per request, per the SDK 1.26.0 security model). */
function createServer (): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.tool(
    'render_xdbml',
    'Render an xDBML schema (an entity/relationship data model) to a diagram. ' +
      'Returns a short summary, a PNG image of the diagram, a link to open the ' +
      'schema in the interactive xDBML playground, and the SVG as a resource. ' +
      'Use this to visualize or sanity-check a data model written in xDBML or DBML.',
    {
      source: z.string().describe('The xDBML (or DBML) document to render.'),
      arrange: z
        .enum(['relational', 'star', 'none'])
        .optional()
        .describe('Auto-layout: relational (default), star (dimensional), or none (raw column layout).'),
      background: z
        .string()
        .optional()
        .describe('Optional CSS background color, e.g. "#ffffff". Default: transparent.'),
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
    'Validate an xDBML (or DBML) schema without rendering it. Checks syntax ' +
      'and resolves references, returning whether the document is valid plus ' +
      'any errors or warnings with their line/column locations. Much cheaper ' +
      'than render_xdbml; use it to catch typos or dangling references while ' +
      'authoring, then render once it is clean.',
    {
      source: z.string().describe('The xDBML (or DBML) document to validate.'),
    },
    async (args) => validateXdbmlTool(args as ValidateArgs),
  );

  return server;
}

const LANDING = `xDBML MCP server

This is a Model Context Protocol (MCP) server. Point an MCP client at the
streamable-HTTP endpoint:

  POST /mcp

Tools:
  render_xdbml(source, arrange?, background?, playground?, image?)
    Renders an xDBML/DBML schema to SVG (plus a PNG by default) and returns
    a playground link.
  validate_xdbml(source)
    Validates an xDBML/DBML schema (syntax + reference resolution) and
    returns any errors or warnings with line/column locations. No rendering.

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
