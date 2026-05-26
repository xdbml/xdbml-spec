/**
 * Thin logger so we don't litter `console.log` in components and can
 * silence chatty modules later if needed.
 */
const isDev = import.meta.env.DEV;

function info (...args: unknown[]): void {
  if (isDev) console.info('[xdbml]', ...args);
}

function warn (...args: unknown[]): void {
  console.warn('[xdbml]', ...args);
}

function error (...args: unknown[]): void {
  console.error('[xdbml]', ...args);
}

export default { info, warn, error };
