// Resolve hook registered by parser-from-source.mjs.
const parserEntry = new URL('../../parser/src/index.ts', import.meta.url).href;

export async function resolve (specifier, context, nextResolve) {
  if (specifier === '@xdbml/parse') {
    return { url: parserEntry, format: 'module-typescript', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
