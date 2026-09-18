import { describe, expect, it } from 'vitest';
import {
  ChromeSourceMapContextAdapter,
  type SourceMapFetch,
} from '../../src/adapters/chrome/source-map-context';
import {
  VALID_SOURCE_MAP_CONTEXT_REQUEST,
  describeSourceMapContextPortContract,
} from './source-map-context.contract';

/**
 * Same fixture as the core resolver tests: generated line 2, column 4 maps to
 * `../src/PricingCard.tsx` line 10 column 3.
 */
const FIXTURE_MAP = {
  version: 3,
  sources: ['../src/PricingCard.tsx', '../src/theme.ts'],
  names: [],
  mappings: 'AAAA;IASE;QCTF',
};

const PAGE_URL = 'https://example.com/pricing';
const COMPILED_URL = 'https://example.com/static/js/main.js';
const MAP_URL = 'https://example.com/static/js/main.js.map';
const COMPILED_BODY = 'console.log("app");\n//# sourceMappingURL=main.js.map\n';

const REQUEST = {
  pageUrl: PAGE_URL,
  reference: { fileName: '/static/js/main.js', line: 2, column: 5 },
};

interface StubRoute {
  readonly status?: number;
  readonly body?: string;
  readonly throws?: boolean;
}

function stubFetch(routes: Record<string, StubRoute>): {
  readonly fetch: SourceMapFetch;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const fetch: SourceMapFetch = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) {
      return { ok: false, status: 404, text: async () => '' };
    }
    if (route.throws === true) {
      throw new Error('network down');
    }
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => route.body ?? '',
    };
  };
  return { fetch, calls };
}

function adapter(
  routes: Record<string, StubRoute>,
  options: {
    readonly maxCompiledCharacters?: number;
    readonly maxSourceMapCharacters?: number;
  } = {},
): ChromeSourceMapContextAdapter {
  return new ChromeSourceMapContextAdapter({ fetch: stubFetch(routes).fetch, ...options });
}

describeSourceMapContextPortContract({
  createPort: () => adapter({}),
});

describe('ChromeSourceMapContextAdapter', () => {
  it('resolves a compiled position through the published source map', async () => {
    const routes = stubFetch({
      [COMPILED_URL]: { body: COMPILED_BODY },
      [MAP_URL]: { body: JSON.stringify(FIXTURE_MAP) },
    });
    const sourceMap = new ChromeSourceMapContextAdapter({ fetch: routes.fetch });

    await expect(sourceMap.resolve(REQUEST)).resolves.toEqual({
      kind: 'mapped',
      sourceFile: '../src/PricingCard.tsx',
      line: 10,
      column: 3,
      reason: `Resolved from the source map of ${COMPILED_URL}.`,
    });
    expect(routes.calls).toEqual([COMPILED_URL, MAP_URL]);
  });

  it('decodes an inline data-url source map without a second request', async () => {
    const inlineMap = Buffer.from(JSON.stringify(FIXTURE_MAP), 'utf8').toString('base64');
    const routes = stubFetch({
      [COMPILED_URL]: {
        body: `console.log("app");\n//# sourceMappingURL=data:application/json;base64,${inlineMap}\n`,
      },
    });
    const sourceMap = new ChromeSourceMapContextAdapter({ fetch: routes.fetch });

    await expect(sourceMap.resolve(REQUEST)).resolves.toMatchObject({
      kind: 'mapped',
      sourceFile: '../src/PricingCard.tsx',
      line: 10,
      column: 3,
    });
    expect(routes.calls).toEqual([COMPILED_URL]);
  });

  it('reports an explicit reason when no source map is published', async () => {
    const sourceMap = adapter({ [COMPILED_URL]: { body: 'console.log("app");' } });

    await expect(sourceMap.resolve(REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: `No source map is published for ${COMPILED_URL}.`,
    });
  });

  it('reports an explicit reason when the compiled file or the map cannot be read', async () => {
    await expect(adapter({}).resolve(REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: `The compiled file could not be read (${COMPILED_URL}).`,
    });

    await expect(
      adapter({
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { status: 500, body: 'boom' },
      }).resolve(REQUEST),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: `The source map of ${COMPILED_URL} could not be read.`,
    });

    await expect(
      adapter({
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { throws: true },
      }).resolve(REQUEST),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: `The source map of ${COMPILED_URL} could not be read.`,
    });
  });

  it('reports an explicit reason for an invalid or unmapped source map', async () => {
    await expect(
      adapter({
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { body: 'not json' },
      }).resolve(REQUEST),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: `The source map of ${COMPILED_URL} is invalid.`,
    });

    await expect(
      adapter({
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { body: JSON.stringify({ version: 2, sources: [], mappings: '' }) },
      }).resolve(REQUEST),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: `The source map of ${COMPILED_URL} is invalid.`,
    });

    await expect(
      adapter({
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { body: JSON.stringify({ version: 3, sources: ['a.ts'], mappings: '' }) },
      }).resolve(REQUEST),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: `The source map of ${COMPILED_URL} has no mapping for the reported line.`,
    });
  });

  it('refuses references that are not readable http(s) URLs', async () => {
    await expect(
      adapter({}).resolve({
        pageUrl: PAGE_URL,
        reference: { fileName: 'webpack-internal:///./src/App.tsx', line: 1, column: 1 },
      }),
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'The source reference is not a readable http(s) URL.',
    });

    await expect(
      adapter({}).resolve({
        pageUrl: PAGE_URL,
        reference: { fileName: 'https://user:pass@example.com/main.js', line: 1, column: 1 },
      }),
    ).resolves.toMatchObject({ kind: 'unavailable' });

    await expect(
      adapter({}).resolve({
        pageUrl: 'not a url',
        reference: { fileName: '', line: null, column: null },
      }),
    ).resolves.toMatchObject({ kind: 'unavailable' });
  });

  it('refuses oversized payloads instead of loading them into memory', async () => {
    const sourceMap = adapter(
      {
        [COMPILED_URL]: { body: COMPILED_BODY },
        [MAP_URL]: { body: JSON.stringify(FIXTURE_MAP) },
      },
      { maxCompiledCharacters: 10 },
    );

    await expect(sourceMap.resolve(REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: `The compiled file could not be read (${COMPILED_URL}).`,
    });
  });

  it('never throws when the transport itself fails', async () => {
    const sourceMap = adapter({ [COMPILED_URL]: { throws: true } });

    await expect(sourceMap.resolve(VALID_SOURCE_MAP_CONTEXT_REQUEST)).resolves.toMatchObject({
      kind: 'unavailable',
    });
  });
});
