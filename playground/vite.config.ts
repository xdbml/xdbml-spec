import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

/**
 * Playground Vite config.
 *
 * `base: '/playground/'` -- the playground deploys as a subpath of the
 * main site (xdbml.org/playground/), so all asset URLs are prefixed with
 * /playground/. When running standalone (npm run dev), Vite serves it
 * the same way at localhost:3001/playground/, which mirrors production
 * URL shape.
 *
 * `@xdbml/parse` resolves to the sibling /parser/ package's source via
 * a Vite alias. No publish step needed during development -- changes to
 * the parser are picked up on hot reload. The same alias is mirrored in
 * tsconfig.json so vue-tsc resolves the same path during type-checking.
 *
 * The .xdbml example files at /examples/ (one level up from /playground/)
 * are imported with the ?raw suffix via Vite's static asset handling,
 * which inlines them as strings at build time. No special config needed.
 */
export default defineConfig({
  base: '/playground/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@xdbml/parse': resolve(__dirname, '../parser/src/index.ts'),
    },
  },
  server: {
    // 5174 is adjacent to VitePress's default 5173. Two reasons:
    //   1. Easy to remember -- one digit apart, both five-digit ports.
    //   2. No clash if `vitepress dev` is also running (e.g. you're
    //      iterating on the playground but have the docs site open in
    //      another tab).
    // When you only want to verify the integrated site, run
    // `npm run docs:dev` from the repo root -- that builds the
    // playground first and VitePress serves it at /playground/ on 5173.
    port: 5174,
    open: false,
  },
  build: {
    target: 'esnext',
    // Output goes here; the docs build picks it up and copies into the
    // VitePress public/playground/ directory.
    outDir: 'dist',
  },
  optimizeDeps: {
    include: ['monaco-editor', 'vue'],
  },
});
