import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  createEvidence,
  createSourceMapEvidence,
  unavailableSourceMapObservation,
  type SourceMapObservation,
} from '@core';

const CREATED_AT = '2026-09-18T10:05:00.000Z';

const BASE = {
  id: 'evidence-source-map',
  commentId: 'comment-1',
  capturedAt: CREATED_AT,
} as const;

function observation(overrides: Partial<SourceMapObservation> = {}): SourceMapObservation {
  return {
    sourceFile: '../src/PricingCard.tsx',
    line: 42,
    column: 3,
    confidence: 'inferred',
    reason: 'Resolved from the source map of https://example.com/static/js/main.js.',
    ...overrides,
  };
}

describe('createSourceMapEvidence', () => {
  it('links the source payload and its confidence to the comment', () => {
    const evidence = createSourceMapEvidence({ ...BASE, observation: observation() });

    expect(evidence).toMatchObject({
      id: 'evidence-source-map',
      commentId: 'comment-1',
      confidence: 'inferred',
      capturedAt: CREATED_AT,
      payload: {
        type: 'source-map',
        sourceFile: '../src/PricingCard.tsx',
        line: 42,
        column: 3,
        reason: 'Resolved from the source map of https://example.com/static/js/main.js.',
      },
    });
  });

  it('keeps an explicit unavailable observation with its reason', () => {
    const evidence = createSourceMapEvidence({
      ...BASE,
      observation: unavailableSourceMapObservation('No source map is published for main.js.'),
    });

    expect(evidence).toMatchObject({
      confidence: 'unavailable',
      payload: {
        type: 'source-map',
        sourceFile: null,
        line: null,
        column: null,
        reason: 'No source map is published for main.js.',
      },
    });
  });

  it('rejects an out-of-vocabulary confidence or a non-positive position', () => {
    expect(() =>
      createSourceMapEvidence({
        ...BASE,
        observation: observation({ confidence: 'certain' as never }),
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createSourceMapEvidence({ ...BASE, observation: observation({ line: 0 }) }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createSourceMapEvidence({ ...BASE, observation: observation({ column: -1 }) }),
    ).toThrow(DomainValidationError);
  });

  it('refuses an unavailable result without a reason or with a file claim', () => {
    expect(() =>
      createSourceMapEvidence({
        ...BASE,
        observation: observation({ confidence: 'unavailable', reason: null }),
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createSourceMapEvidence({
        ...BASE,
        observation: observation({ confidence: 'unavailable' }),
      }),
    ).toThrow(DomainValidationError);
  });

  it('requires an inferred result to explain how it was obtained', () => {
    expect(() =>
      createSourceMapEvidence({ ...BASE, observation: observation({ reason: null }) }),
    ).toThrow(DomainValidationError);
  });

  it('bounds page-provided file references and reasons before persisting them', () => {
    const evidence = createSourceMapEvidence({
      ...BASE,
      observation: observation({
        sourceFile: `src/${'D'.repeat(900)}.tsx`,
        reason: 'R'.repeat(600),
      }),
    });

    expect(evidence.payload.type).toBe('source-map');
    if (evidence.payload.type !== 'source-map') {
      return;
    }
    expect(evidence.payload.sourceFile?.length).toBeLessThanOrEqual(512);
    expect(evidence.payload.sourceFile?.endsWith('…')).toBe(true);
    expect(evidence.payload.reason?.length).toBeLessThanOrEqual(240);
  });

  it('is the only gate: raw createEvidence also validates source-map payloads', () => {
    expect(() =>
      createEvidence({
        ...BASE,
        confidence: 'inferred',
        payload: { type: 'source-map', sourceFile: '  ', line: null, column: null, reason: 'x' },
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createEvidence({
        ...BASE,
        confidence: 'unavailable',
        payload: { type: 'source-map', sourceFile: 'main.js', line: null, column: null, reason: null },
      }),
    ).toThrow(DomainValidationError);
  });
});
