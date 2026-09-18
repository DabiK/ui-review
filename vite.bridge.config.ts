import { builtinModules } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

/**
 * Third build pass: the companion native bridge executable, emitted as a Node ESM bundle in
 * `dist/bridge/`. It only uses Node builtins, so those stay external; Chrome launches it
 * through a Native Messaging host manifest (installed by `npm run bridge:install`).
 */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: fromRoot('./src/bridge/main.ts'),
    outDir: 'dist/bridge',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: true,
    rolldownOptions: {
      external: nodeBuiltins,
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
