/**
 * Pure render-tool logic for the xDBML MCP server, kept separate from the
 * MCP/transport wiring so it can be unit-tested directly against
 * `@xdbml/render` with no MCP SDK in the loop.
 */

import { renderToSVG, buildDiagram, defaultTheme, darkTheme } from '@xdbml/render';
import { parse, flatten } from '@xdbml/parse';

export const PLAYGROUND_URL = 'https://xdbml.org/playground/';

export interface RenderArgs {
  source: string;
  arrange?: 'relational' | 'star' | 'none';
  background?: string;
  playground?: boolean;
  mode?: 'light' | 'dark';
}

export type ToolResult = {
  isError?: boolean;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType: string; text: string } }
  >;
};

export function renderXdbmlTool (args: RenderArgs): ToolResult {
  const { source, arrange, background, playground = true, mode = 'light' } = args;

  // A standalone SVG is transparent by default and the viewer paints behind
  // it. On the dark theme the row text is light, so without a dark backdrop it
  // would land on the viewer's white page (and the white PNG canvas). Paint the
  // dark canvas unless the caller gave an explicit background. This also makes
  // the rasterized PNG dark, since the full-canvas rect covers resvg's white.
  const theme = mode === 'dark' ? darkTheme : defaultTheme;
  const bg = background ?? (mode === 'dark' ? darkTheme.canvas.background : undefined);

  let svg: string;
  try {
    svg = renderToSVG(source, {
      arrange,
      theme,
      background: bg,
      playgroundLink: playground ? PLAYGROUND_URL : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      isError: true,
      content: [{ type: 'text', text: `Could not render xDBML: ${message}` }],
    };
  }

  // Parsing already succeeded inside renderToSVG, so this is safe; used only
  // to report what was rendered.
  const model = buildDiagram(flatten(parse(source)));
  const entities = model.entities.length;
  const refs = model.refs.length;

  // Reuse the renderer's own playground href (single source of truth) rather
  // than recomputing the share hash here.
  const linkMatch = svg.match(/href="([^"]+#s=[^"]+)"/);
  const playgroundLink = linkMatch ? linkMatch[1] : null;

  const lines = [
    `Rendered ${entities} ${entities === 1 ? 'entity' : 'entities'} and ` +
      `${refs} ${refs === 1 ? 'relationship' : 'relationships'} ` +
      `(arrange: ${arrange ?? 'relational'}).`,
  ];
  if (playgroundLink) {
    lines.push('', 'Open the interactive, editable diagram in the xDBML playground:', playgroundLink);
  }
  lines.push(
    '',
    'The full SVG is attached as a resource. Note: most chat clients show MCP ' +
      'tool images only inside the expandable tool-call panel, not inline, so ' +
      'the playground link above is the reliable way to view and edit it.',
  );

  return {
    content: [
      { type: 'text', text: lines.join('\n') },
      {
        type: 'resource',
        resource: { uri: 'xdbml://diagram.svg', mimeType: 'image/svg+xml', text: svg },
      },
    ],
  };
}
