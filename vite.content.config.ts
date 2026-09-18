import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Second build pass for the page overlay. MV3 `content_scripts` cannot be ES modules, so the
 * content script is emitted as a standalone IIFE into the same `dist/` directory as the
 * side panel and service worker built by `vite.config.ts`.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@core': fromRoot('./src/core/index.ts'),
      '@adapters': fromRoot('./src/adapters'),
      '@app': fromRoot('./src/app/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: true,
    lib: {
      entry: fromRoot('./src/content/index.ts'),
      formats: ['iife'],
      name: 'UiReviewContentScript',
      fileName: () => 'content-script.js',
    },
  },
});
