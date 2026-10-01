// Resolve hook registered by parser-from-source.mjs.
const parserEntry = new URL('../../parser/src/index.ts', import.meta.url).href;
// The render tool's tests need the renderer of this release too (spec §18
// diagram views arrive in both packages at once).
const rendererEntry = new URL('../../renderer/src/index.ts', import.meta.url).href;

export async function resolve (specifier, context, nextResolve) {
  if (specifier === '@xdbml/parse') {
    return { url: parserEntry, format: 'module-typescript', shortCircuit: true };
  }
  if (specifier === '@xdbml/render') {
    return { url: rendererEntry, format: 'module-typescript', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
