import { describe, expect, it } from 'vitest';
import { FakeComponentContextAdapter } from '../../src/adapters/runtime/fake-component-context';
import {
  VALID_COMPONENT_CONTEXT_REQUEST,
  describeComponentContextPortContract,
} from './component-context.contract';

describeComponentContextPortContract({
  createPort: () =>
    new FakeComponentContextAdapter({
      observation: {
        framework: 'react',
        componentName: 'PricingCard',
        componentChain: ['PricingPage', 'PricingCard'],
        confidence: 'confirmed',
        sourceReference: null,
      },
    }),
});

describe('FakeComponentContextAdapter', () => {
  it('never pretends to detect a framework unless configured', async () => {
    const adapter = new FakeComponentContextAdapter();

    await expect(adapter.detect(VALID_COMPONENT_CONTEXT_REQUEST)).resolves.toEqual({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    });
  });

  it('records every request and returns a defensive copy of the observation', async () => {
    const adapter = new FakeComponentContextAdapter({
      observation: {
        framework: 'vue',
        componentName: 'VueCard',
        componentChain: ['VuePage', 'VueCard'],
        confidence: 'inferred',
        sourceReference: null,
      },
    });

    const first = await adapter.detect(VALID_COMPONENT_CONTEXT_REQUEST);
    (first.componentChain as string[]).push('Injected');
    const second = await adapter.detect(VALID_COMPONENT_CONTEXT_REQUEST);

    expect(adapter.requests).toEqual([VALID_COMPONENT_CONTEXT_REQUEST, VALID_COMPONENT_CONTEXT_REQUEST]);
    expect(second.componentChain).toEqual(['VuePage', 'VueCard']);
  });

  it('lets a test observe detections and update the observation', async () => {
    const adapter = new FakeComponentContextAdapter();
    const seen: string[] = [];
    adapter.setOnDetect((request) => {
      seen.push(request.fingerprint);
    });
    adapter.setObservation({
      framework: 'react',
      componentName: 'Card',
      componentChain: ['Card'],
      confidence: 'inferred',
      sourceReference: null,
    });

    await adapter.detect(VALID_COMPONENT_CONTEXT_REQUEST);

    expect(seen).toEqual(['main > button']);
  });
});
