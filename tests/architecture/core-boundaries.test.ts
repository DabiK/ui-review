import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CORE_DIR = fileURLToPath(new URL('../../src/core', import.meta.url));

const IMPORT_PATTERN =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const FORBIDDEN_GLOBALS =
  /\b(?:chrome|document|window|indexedDB|localStorage|sessionStorage|XMLHttpRequest|HTMLElement|React|Vue)\b/;

function collectCoreSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCoreSources(fullPath));
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
 * Architecture guard: the domain core must stay independent from Chrome, the DOM,
 * frameworks, Node and every adapter module. This is the acceptance criterion for #1
 * expressed as a test, so a future change cannot silently break the dependency rule.
 */
describe('review-core boundaries', () => {
  const sourceFiles = collectCoreSources(CORE_DIR);

  it('has core sources to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('only imports modules from within src/core', () => {
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        const location = relative(CORE_DIR, file);
        if (!specifier.startsWith('.')) {
          violations.push(`${location} imports the external module "${specifier}"`);
          continue;
        }
        const resolved = resolve(dirname(file), specifier);
        if (resolved !== CORE_DIR && !resolved.startsWith(`${CORE_DIR}${sep}`)) {
          violations.push(`${location} escapes the core through "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('never references Chrome, DOM or framework globals', () => {
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const match = FORBIDDEN_GLOBALS.exec(source);
      if (match !== null) {
        violations.push(`${relative(CORE_DIR, file)} references "${match[0]}"`);
      }
    }

    expect(violations).toEqual([]);
  });
});
