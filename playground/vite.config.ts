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
      '@xdbml/render/interactive': resolve(__dirname, '../renderer/src/interactive/index.ts'),
      '@xdbml/render': resolve(__dirname, '../renderer/src/index.ts'),
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
    // Vite warns when any chunk exceeds 500 kB minified. Monaco's core
    // editor module is ~2.3 MB on its own (it includes the editor model,
    // undo stack, syntax highlighting infrastructure, minimap, scrollbar,
    // find widget, and more). That's an inherent floor we can't lower
    // without switching editors, so the warning is misleading. Raise
    // the limit above Monaco's size to keep the warning useful for
    // chunks we DO control. If a NEW chunk crosses ~3 MB, that's a real
    // signal worth investigating.
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        // Manual chunking strategy: split heavy, slow-changing vendor
        // code into its own chunks separate from app code. Three reasons:
        //
        //   1. Monaco is ~2 MB of editor infrastructure. Splitting it
        //      out lets the browser cache it independently of our app
        //      code. Returning users who hit the playground after we
        //      ship a new release only re-download the app chunk
        //      (typically tens of KB) instead of the whole 2.5 MB bundle.
        //
        //   2. HTTP/2 fetches the chunks in parallel, so first-load
        //      time is no worse than a single big bundle, often slightly
        //      better.
        //
        //   3. Quiets Vite's "chunk larger than 500 kB" warning by
        //      making each chunk's size explicit rather than hiding
        //      everything in one opaque bundle.
        //
        // Note: this does NOT defer Monaco's download -- it still
        // loads eagerly on first visit. Deferring Monaco until the
        // editor is actually rendered would require dynamic imports
        // in XdbmlEditor.vue; that's a follow-up if first-load
        // performance becomes a concern.
        manualChunks: {
          monaco: ['monaco-editor/esm/vs/editor/editor.api'],
          vue: ['vue', 'pinia'],
        },
      },
    },
  },
  optimizeDeps: {
    // Use the API-only ESM entry point (not the full 'monaco-editor'
    // main entry). The .api path skips Monaco's auto-registration of
    // 80+ default languages -- we only need our custom Monarch grammar
    // for xdbml. This single import-path change shaves ~600 KB of
    // language-pack code from the production bundle.
    include: ['monaco-editor/esm/vs/editor/editor.api', 'vue'],
  },
});
