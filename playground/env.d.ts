/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
  export default component;
}

/**
 * Allow `import sample from '../../../examples/01-blog.xdbml?raw'`.
 * Vite inlines the file contents as a string at build time. The `?raw`
 * suffix is Vite-specific; the `vite/client` reference above declares
 * its general behavior but only for known extensions, so we extend it.
 */
declare module '*.xdbml?raw' {
  const content: string;
  export default content;
}
