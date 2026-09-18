import { describe, expect, it } from 'vitest';
import { FakeSourceMapContextAdapter } from '../../src/adapters/runtime/fake-source-map-context';
import {
  VALID_SOURCE_MAP_CONTEXT_REQUEST,
  describeSourceMapContextPortContract,
} from './source-map-context.contract';

describeSourceMapContextPortContract({
  createPort: () =>
    new FakeSourceMapContextAdapter({
      resolution: {
        kind: 'mapped',
        sourceFile: '../src/PricingCard.tsx',
        line: 42,
        column: 3,
        reason: 'Resolved from the source map of https://example.com/static/js/main.js.',
      },
    }),
});

describe('FakeSourceMapContextAdapter', () => {
  it('never pretends to resolve a location unless configured', async () => {
    const adapter = new FakeSourceMapContextAdapter();

    await expect(adapter.resolve(VALID_SOURCE_MAP_CONTEXT_REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'The fake source-map adapter is not configured.',
    });
  });

  it('records every request and returns a defensive copy of the reference', async () => {
    const adapter = new FakeSourceMapContextAdapter();
    const request = {
      pageUrl: 'https://example.com/pricing',
      reference: { fileName: '/static/js/main.js', line: 3, column: 9 },
    };

    await adapter.resolve(request);
    request.reference.fileName = 'mutated';

    expect(adapter.requests).toEqual([
      {
        pageUrl: 'https://example.com/pricing',
        reference: { fileName: '/static/js/main.js', line: 3, column: 9 },
      },
    ]);
  });

  it('lets a test observe resolutions and update the result', async () => {
    const adapter = new FakeSourceMapContextAdapter();
    const seen: string[] = [];
    adapter.setOnResolve((request) => {
      seen.push(request.reference.fileName);
    });
    adapter.setResolution({ kind: 'unavailable', reason: 'no map' });

    await expect(adapter.resolve(VALID_SOURCE_MAP_CONTEXT_REQUEST)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'no map',
    });
    expect(seen).toEqual(['https://example.com/_next/static/chunks/pricing.js']);
  });
});
