/**
 * Light/dark appearance for the playground.
 *
 * Two-stage design, so the page never flashes the wrong theme:
 *
 *   1. A tiny inline bootstrap in index.html runs before first paint. It
 *      resolves the initial mode -- URL `?theme=` (the hand-off from the
 *      xdbml.org website) wins, then localStorage, then the OS
 *      `prefers-color-scheme` -- writes the `dark` class and `color-scheme`
 *      onto <html>, persists a URL-supplied value, and strips the param.
 *
 *   2. This module owns runtime changes. It seeds its reactive state from
 *      whatever the bootstrap already applied (reading the live <html>
 *      class), then `toggle()` / `setAppearance()` update the class,
 *      `color-scheme`, localStorage, and the reactive ref together.
 *
 * The precedence logic lives only in the bootstrap (it runs once); this
 * module only flips an already-resolved state. Both sides share the same
 * storage key and `dark` class name, defined here as the contract.
 */
import { computed, ref, type ComputedRef } from 'vue';

export type Appearance = 'light' | 'dark';

/** localStorage key. Matches the `xdbml-playground:` prefix used elsewhere. */
export const APPEARANCE_STORAGE_KEY = 'xdbml-playground:appearance';

/** Read the mode the bootstrap applied, by inspecting the live <html> class. */
function currentFromDom (): Appearance {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// Module-level singleton: every component that calls useAppearance() shares
// one reactive source, so the header toggle and the diagram/editor all stay
// in lockstep.
const appearance = ref<Appearance>(currentFromDom());

function apply (mode: Appearance): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
  } catch {
    // best-effort: a blocked localStorage just means no persistence
  }
  appearance.value = mode;
}

export interface UseAppearance {
  appearance: typeof appearance;
  isDark: ComputedRef<boolean>;
  setAppearance: (mode: Appearance) => void;
  toggle: () => void;
}

export function useAppearance (): UseAppearance {
  const isDark = computed(() => appearance.value === 'dark');
  return {
    appearance,
    isDark,
    setAppearance: apply,
    toggle: () => apply(appearance.value === 'dark' ? 'light' : 'dark'),
  };
}
