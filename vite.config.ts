import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  publicDir: 'public',
  resolve: {
    alias: {
      '@core': fromRoot('./src/core/index.ts'),
      '@adapters': fromRoot('./src/adapters'),
      '@app': fromRoot('./src/app/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: true,
    rolldownOptions: {
      input: {
        sidepanel: fromRoot('./sidepanel.html'),
        'service-worker': fromRoot('./src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
