#!/usr/bin/env node
/**
 * Runs both Vite builds in watch mode: the side panel + service worker (ESM) and the page
 * content script (IIFE, required by the MV3 `content_scripts` format).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const commands = [
  [viteBin, 'build', '--watch', '--mode', 'development'],
  [viteBin, 'build', '--watch', '--mode', 'development', '--config', 'vite.content.config.ts'],
];

const children = commands.map((args) =>
  spawn(process.execPath, args, { cwd: root, stdio: 'inherit' }),
);

let stopping = false;

function stop(signal) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `[ui-review] a build watcher exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      );
      stop('SIGTERM');
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
