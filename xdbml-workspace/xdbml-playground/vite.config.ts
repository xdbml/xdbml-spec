import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

/**
 * Vite resolves `@xdbml/parse` to the sibling package's TypeScript source
 * directly. This keeps the parser as a separate package (so it can be
 * published independently and consumed by other tools), while avoiding
 * the bundle/publish dance during playground development.
 *
 * `@` is the conventional alias for the playground's own src/ root.
 */
export default defineConfig({
  base: '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@xdbml/parse': resolve(__dirname, '../xdbml-parse/src/index.ts'),
    },
  },
  server: {
    port: 3001,
    open: false,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    include: ['monaco-editor', 'vue'],
  },
});
