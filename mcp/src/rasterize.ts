/**
 * SVG -> PNG rasterization for the render tool, using resvg compiled to WASM.
 *
 * resvg needs real font data to draw text, so a sans-serif font is bundled and
 * set as the default family; the diagram's `font-family` stack does not resolve
 * on a Worker (no system fonts), so resvg falls back to this font for all text.
 * The WASM module is initialized once per isolate.
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import fontTtf from '../assets/DejaVuSans.ttf';

let initPromise: Promise<unknown> | null = null;
function ensureWasm (): Promise<unknown> {
  if (!initPromise) initPromise = initWasm(resvgWasm);
  return initPromise;
}

const FONT = new Uint8Array(fontTtf);

/** Cap the raster width so a very wide diagram does not produce a huge PNG. */
const MAX_PNG_WIDTH = 1600;

function bytesToBase64 (bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Rasterize an SVG string to a base64-encoded PNG (on a white background). */
export async function svgToPngBase64 (svg: string): Promise<string> {
  await ensureWasm();

  const widthMatch = svg.match(/width="(\d+)"/);
  const naturalWidth = widthMatch ? parseInt(widthMatch[1], 10) : 0;
  const fitTo = naturalWidth > MAX_PNG_WIDTH
    ? ({ mode: 'width', value: MAX_PNG_WIDTH } as const)
    : ({ mode: 'original' } as const);

  const resvg = new Resvg(svg, {
    fitTo,
    background: 'white',
    font: {
      fontBuffers: [FONT],
      defaultFontFamily: 'DejaVu Sans',
      loadSystemFonts: false,
    },
  });

  return bytesToBase64(resvg.render().asPng());
}
