import { describe, expect, it } from 'vitest';
import type {
  SourceMapContextPort,
  SourceMapContextRequest,
  SourceMapResolution,
} from '@core';

export interface SourceMapContextPortContractOptions {
  readonly createPort: () => SourceMapContextPort;
}

export const VALID_SOURCE_MAP_CONTEXT_REQUEST: SourceMapContextRequest = {
  pageUrl: 'https://example.com/pricing',
  reference: {
    fileName: 'https://example.com/_next/static/chunks/pricing.js',
    line: 3,
    column: 9,
  },
};

function expectWellShapedResolution(resolution: SourceMapResolution): void {
  if (resolution.kind === 'mapped') {
    expect(resolution.sourceFile.trim()).not.toBe('');
    expect(resolution.reason.trim()).not.toBe('');
    if (resolution.line !== null) {
      expect(Number.isInteger(resolution.line)).toBe(true);
    }
    if (resolution.column !== null) {
      expect(Number.isInteger(resolution.column)).toBe(true);
    }
    return;
  }

  expect(resolution.kind).toBe('unavailable');
  expect(resolution.reason.trim()).not.toBe('');
}

/** Behaviour every `SourceMapContextPort` implementation must provide. */
export function describeSourceMapContextPortContract(
  options: SourceMapContextPortContractOptions,
): void {
  describe('SourceMapContextPort contract', () => {
    it('resolves with a well-shaped result for a valid request', async () => {
      const resolution = await options
        .createPort()
        .resolve(VALID_SOURCE_MAP_CONTEXT_REQUEST);

      expectWellShapedResolution(resolution);
    });

    it('never throws, even for an impossible request', async () => {
      const resolution = await options.createPort().resolve({
        pageUrl: 'not a page url',
        reference: { fileName: '', line: null, column: null },
      });

      expectWellShapedResolution(resolution);
    });
  });
}
