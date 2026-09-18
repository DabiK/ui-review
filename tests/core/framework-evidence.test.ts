import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  createEvidence,
  createFrameworkEvidence,
  type FrameworkObservation,
} from '@core';

const CREATED_AT = '2026-09-18T10:05:00.000Z';

const BASE = {
  id: 'evidence-framework',
  commentId: 'comment-1',
  capturedAt: CREATED_AT,
} as const;

function observation(overrides: Partial<FrameworkObservation> = {}): FrameworkObservation {
  return {
    framework: 'react',
    componentName: 'PricingCard',
    componentChain: ['PricingPage', 'PricingCard'],
    confidence: 'confirmed',
    sourceReference: null,
    ...overrides,
  };
}

describe('createFrameworkEvidence', () => {
  it('links a framework payload and its confidence to the comment', () => {
    const evidence = createFrameworkEvidence({ ...BASE, observation: observation() });

    expect(evidence).toMatchObject({
      id: 'evidence-framework',
      commentId: 'comment-1',
      confidence: 'confirmed',
      capturedAt: CREATED_AT,
      payload: {
        type: 'framework',
        framework: 'react',
        componentName: 'PricingCard',
        componentChain: ['PricingPage', 'PricingCard'],
      },
    });
  });

  it('keeps an explicit unavailable observation instead of dropping it', () => {
    const evidence = createFrameworkEvidence({
      ...BASE,
      observation: observation({
        framework: 'unknown',
        componentName: null,
        componentChain: [],
        confidence: 'unavailable',
      }),
    });

    expect(evidence).toMatchObject({
      confidence: 'unavailable',
      payload: { type: 'framework', framework: 'unknown', componentName: null, componentChain: [] },
    });
  });

  it('rejects an out-of-vocabulary framework or confidence', () => {
    expect(() =>
      createFrameworkEvidence({
        ...BASE,
        observation: observation({ framework: 'angular' as never }),
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createFrameworkEvidence({
        ...BASE,
        observation: observation({ confidence: 'certain' as never }),
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects blank component names and blank chain entries', () => {
    expect(() =>
      createFrameworkEvidence({ ...BASE, observation: observation({ componentName: '   ' }) }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createFrameworkEvidence({
        ...BASE,
        observation: observation({ componentChain: ['PricingPage', ' '] }),
      }),
    ).toThrow(DomainValidationError);
  });

  it('bounds page-provided names and chains before persisting them', () => {
    const longName = 'N'.repeat(400);
    const evidence = createFrameworkEvidence({
      ...BASE,
      observation: observation({
        componentName: longName,
        componentChain: Array.from({ length: 12 }, (_, index) => `Component${String(index)}`),
      }),
    });

    expect(evidence.payload.type).toBe('framework');
    if (evidence.payload.type !== 'framework') {
      return;
    }
    expect(evidence.payload.componentName?.length).toBeLessThanOrEqual(120);
    expect(evidence.payload.componentName?.endsWith('…')).toBe(true);
    expect(evidence.payload.componentChain).toHaveLength(8);
  });

  it('keeps the source reference out of the framework payload', () => {
    const evidence = createFrameworkEvidence({
      ...BASE,
      observation: observation({
        sourceReference: { fileName: 'src/PricingCard.tsx', line: 12, column: 5 },
      }),
    });

    expect(evidence.payload).not.toHaveProperty('sourceReference');
  });

  it('is the only gate: raw createEvidence also validates framework payloads', () => {
    expect(() =>
      createEvidence({
        ...BASE,
        confidence: 'confirmed',
        payload: {
          type: 'framework',
          framework: 'react',
          componentName: '',
          componentChain: [],
        },
      }),
    ).toThrow(DomainValidationError);

    expect(() =>
      createEvidence({
        ...BASE,
        confidence: 'maybe' as never,
        payload: { type: 'framework', framework: 'react', componentName: null, componentChain: [] },
      }),
    ).toThrow(DomainValidationError);
  });
});
