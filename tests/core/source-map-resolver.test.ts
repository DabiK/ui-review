import { describe, expect, it } from 'vitest';
import {
  decodeInlineSourceMap,
  findSourceMappingUrl,
  isDirectSourceReference,
  parseSourceMapDocument,
  resolveSourceMapPosition,
} from '@core';

/**
 * Fixture map used by the resolution tests:
 *   line 1, column 0 -> sources[0], line 1, column 1
 *   line 2, column 4 -> sources[0], line 10, column 3
 *   line 3, column 8 -> sources[1], line 1, column 1
 */
const FIXTURE_MAP = {
  version: 3,
  sources: ['../src/PricingCard.tsx', '../src/theme.ts'],
  names: [],
  mappings: 'AAAA;IASE;QCTF',
} as const;

describe('findSourceMappingUrl', () => {
  it('finds a line comment reference', () => {
    expect(findSourceMappingUrl('console.log(1);\n//# sourceMappingURL=main.js.map\n')).toBe(
      'main.js.map',
    );
  });

  it('finds the legacy syntax and a block comment reference', () => {
    expect(findSourceMappingUrl('//@ sourceMappingURL=legacy.map')).toBe('legacy.map');
    expect(findSourceMappingUrl('code\n/*# sourceMappingURL=inline.map */')).toBe('inline.map');
  });

  it('keeps the last reference, as the specification requires', () => {
    const source = '//# sourceMappingURL=first.map\n//# sourceMappingURL=second.map';
    expect(findSourceMappingUrl(source)).toBe('second.map');
  });

  it('returns null when no reference is published', () => {
    expect(findSourceMappingUrl('const a = 1;')).toBeNull();
    expect(findSourceMappingUrl('')).toBeNull();
  });
});

describe('decodeInlineSourceMap', () => {
  it('decodes a base64 inline map', () => {
    const payload = Buffer.from('{"version":3}', 'utf8').toString('base64');
    expect(decodeInlineSourceMap(`data:application/json;base64,${payload}`)).toBe(
      '{"version":3}',
    );
  });

  it('decodes a URL-encoded inline map', () => {
    expect(
      decodeInlineSourceMap('data:application/json;charset=utf-8,%7B%22version%22%3A3%7D'),
    ).toBe('{"version":3}');
  });

  it('rejects non-data references and invalid payloads', () => {
    expect(decodeInlineSourceMap('main.js.map')).toBeNull();
    expect(decodeInlineSourceMap('data:application/json;base64,not base64!')).toBeNull();
    expect(decodeInlineSourceMap('data:application/json')).toBeNull();
  });
});

describe('parseSourceMapDocument', () => {
  it('accepts a minimal v3 document and drops everything else', () => {
    const map = parseSourceMapDocument({
      version: 3,
      sources: ['../src/App.tsx'],
      sourcesContent: ['SECRET SOURCE'],
      names: ['App'],
      mappings: 'AAAA',
      sourceRoot: 'webpack://_N_E/',
    });

    expect(map).toEqual({
      sources: ['../src/App.tsx'],
      mappings: 'AAAA',
      sourceRoot: 'webpack://_N_E/',
    });
    expect(map).not.toHaveProperty('sourcesContent');
  });

  it('rejects documents that are not usable source maps', () => {
    expect(parseSourceMapDocument(null)).toBeNull();
    expect(parseSourceMapDocument('map')).toBeNull();
    expect(parseSourceMapDocument({ version: 2, sources: [], mappings: '' })).toBeNull();
    expect(parseSourceMapDocument({ version: 3, sources: [], mappings: 3 })).toBeNull();
    expect(parseSourceMapDocument({ version: 3, sources: 'x', mappings: '' })).toBeNull();
    expect(
      parseSourceMapDocument({ version: 3, sources: [1], mappings: '' }),
    ).toBeNull();
    expect(
      parseSourceMapDocument({ version: 3, sources: [], mappings: '', sourceRoot: 3 }),
    ).toBeNull();
  });
});

describe('resolveSourceMapPosition', () => {
  const map = parseSourceMapDocument(FIXTURE_MAP);
  if (map === null) {
    throw new Error('fixture map must be valid');
  }

  it('resolves a known compiled position to the expected source file and line', () => {
    expect(resolveSourceMapPosition(map, 3, 9)).toEqual({
      source: '../src/theme.ts',
      line: 1,
      column: 1,
    });
  });

  it('uses the greatest mapping at or before the requested column', () => {
    expect(resolveSourceMapPosition(map, 3, 5)).toEqual({
      source: '../src/PricingCard.tsx',
      line: 10,
      column: 3,
    });
    expect(resolveSourceMapPosition(map, 2, 1)).toEqual({
      source: '../src/PricingCard.tsx',
      line: 1,
      column: 1,
    });
  });

  it('falls back to the last mapping for a generated line beyond the map', () => {
    expect(resolveSourceMapPosition(map, 99, 1)).toEqual({
      source: '../src/theme.ts',
      line: 1,
      column: 1,
    });
  });

  it('returns null when no mapping can apply', () => {
    expect(resolveSourceMapPosition(map, null, 1)).toBeNull();
    expect(resolveSourceMapPosition(map, 0, 1)).toBeNull();
    expect(resolveSourceMapPosition({ sources: ['a.ts'], mappings: '', sourceRoot: null }, 1, 1))
      .toBeNull();
  });

  it('returns null for malformed mappings instead of guessing', () => {
    expect(
      resolveSourceMapPosition({ sources: ['a.ts'], mappings: '!!!!', sourceRoot: null }, 1, 1),
    ).toBeNull();
    // A generated-only segment maps no source at all.
    expect(
      resolveSourceMapPosition({ sources: ['a.ts'], mappings: 'A', sourceRoot: null }, 1, 1),
    ).toBeNull();
    // An unterminated VLQ continuation is corrupt.
    expect(
      resolveSourceMapPosition({ sources: ['a.ts'], mappings: 'g', sourceRoot: null }, 1, 1),
    ).toBeNull();
  });

  it('returns null when the mapping points outside the sources list', () => {
    // Generated column 0, source index +3, line 0, column 0 but only one source exists.
    expect(
      resolveSourceMapPosition({ sources: ['a.ts'], mappings: 'GAAA', sourceRoot: null }, 1, 1),
    ).toBeNull();
  });
});

describe('isDirectSourceReference', () => {
  it('accepts development source paths', () => {
    expect(isDirectSourceReference('webpack-internal:///./src/PricingCard.tsx')).toBe(true);
    expect(isDirectSourceReference('webpack-internal:///./src/legacy.js')).toBe(true);
    expect(isDirectSourceReference('/src/main.tsx?t=1726660000')).toBe(true);
    expect(isDirectSourceReference('http://localhost:5173/src/App.vue')).toBe(true);
    expect(isDirectSourceReference('file:///app/src/card.svelte')).toBe(true);
  });

  it('refuses compiled artifacts and unknown references', () => {
    expect(isDirectSourceReference('/static/js/main.js')).toBe(false);
    expect(isDirectSourceReference('/_next/static/chunks/app/page-abc123.js')).toBe(false);
    expect(isDirectSourceReference('https://cdn.example.com/lib.min.js')).toBe(false);
    expect(isDirectSourceReference('')).toBe(false);
    expect(isDirectSourceReference('   ')).toBe(false);
  });
});
