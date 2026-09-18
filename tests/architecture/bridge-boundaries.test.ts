import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BRIDGE_DIR = resolve(ROOT, 'src/bridge');
const BRIDGE_CORE_DIR = resolve(BRIDGE_DIR, 'core');
const SHARED_PROTOCOL_DIR = resolve(ROOT, 'src/core/bridge');

const IMPORT_PATTERN = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RUNTIME_GLOBALS =
  /\b(?:process|Buffer|console|require|__dirname|__filename|fetch|chrome|document|window|indexedDB)\b/;
const NETWORK_IMPORTS = [
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:dgram',
  'node:tls',
];

function collectSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSources(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Architecture guard for the native bridge: the bridge core stays pure (no Node, OS or
 * adapter imports), and no bridge file may open a network listener — Native Messaging over
 * stdio is the only transport.
 */
describe('native bridge boundaries', () => {
  const bridgeSources = collectSources(BRIDGE_DIR);
  const coreSources = collectSources(BRIDGE_CORE_DIR);

  it('has bridge sources to check', () => {
    expect(bridgeSources.length).toBeGreaterThan(0);
    expect(coreSources.length).toBeGreaterThan(0);
  });

  it('keeps the bridge core free of runtime technology imports', () => {
    const violations: string[] = [];

    for (const file of coreSources) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        const location = relative(ROOT, file);
        if (!specifier.startsWith('.')) {
          violations.push(`${location} imports the external module "${specifier}"`);
          continue;
        }
        const resolved = resolve(dirname(file), specifier);
        const allowed =
          resolved === BRIDGE_CORE_DIR ||
          resolved.startsWith(`${BRIDGE_CORE_DIR}${sep}`) ||
          resolved === SHARED_PROTOCOL_DIR ||
          resolved.startsWith(`${SHARED_PROTOCOL_DIR}${sep}`);
        if (!allowed) {
          violations.push(`${location} escapes the pure bridge core through "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('never references Node, OS or browser globals from the bridge core', () => {
    const violations: string[] = [];

    for (const file of coreSources) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const match = RUNTIME_GLOBALS.exec(source);
      if (match !== null) {
        violations.push(`${relative(ROOT, file)} references "${match[0]}"`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('never opens an HTTP or socket listener anywhere in the bridge', () => {
    const violations: string[] = [];

    for (const file of bridgeSources) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const specifier of importSpecifiers(source)) {
        if (NETWORK_IMPORTS.includes(specifier)) {
          violations.push(`${relative(ROOT, file)} imports "${specifier}"`);
        }
      }
      if (/\bcreateServer\b/.test(source) || /\.listen\s*\(/.test(source)) {
        violations.push(`${relative(ROOT, file)} looks like it opens a listener`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('never writes protocol diagnostics to the stdout pipe', () => {
    const violations: string[] = [];

    for (const file of bridgeSources) {
      const source = stripComments(readFileSync(file, 'utf8'));
      if (/console\.log\b/.test(source)) {
        violations.push(`${relative(ROOT, file)} writes to stdout with console.log`);
      }
    }

    expect(violations).toEqual([]);
  });
});
