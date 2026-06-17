/**
 * Minimal SVG string helpers. The serializer emits raw SVG markup, so the
 * only escaping that matters is for text content and attribute values that
 * carry user-supplied strings (entity/field names, type labels). Numeric
 * coordinates are produced from the layout model and never need escaping.
 */

export function escapeXml (s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
