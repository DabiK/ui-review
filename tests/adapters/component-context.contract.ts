import { describe, expect, it } from 'vitest';
import type { ComponentContextPort, ComponentContextRequest, FrameworkObservation } from '@core';

export interface ComponentContextPortContractOptions {
  readonly createPort: () => ComponentContextPort;
}

export const VALID_COMPONENT_CONTEXT_REQUEST: ComponentContextRequest = {
  tabId: 7,
  frameId: 0,
  fingerprint: 'main > button',
};

function expectWellShapedObservation(observation: FrameworkObservation): void {
  expect(['react', 'vue', 'unknown']).toContain(observation.framework);
  expect(['confirmed', 'inferred', 'unavailable']).toContain(observation.confidence);
  expect(observation.componentChain.length).toBeLessThanOrEqual(8);
  for (const name of observation.componentChain) {
    expect(name.trim()).not.toBe('');
  }
  if (observation.componentName !== null) {
    expect(observation.componentName.trim()).not.toBe('');
  }
  if (observation.sourceReference !== null) {
    expect(observation.sourceReference.fileName.trim()).not.toBe('');
    if (observation.sourceReference.line !== null) {
      expect(observation.sourceReference.line).toBeGreaterThanOrEqual(1);
    }
    if (observation.sourceReference.column !== null) {
      expect(observation.sourceReference.column).toBeGreaterThanOrEqual(1);
    }
  }
}

/** Behaviour every `ComponentContextPort` implementation must provide. */
export function describeComponentContextPortContract(
  options: ComponentContextPortContractOptions,
): void {
  describe('ComponentContextPort contract', () => {
    it('resolves with a well-shaped observation for a valid request', async () => {
      const observation = await options.createPort().detect(VALID_COMPONENT_CONTEXT_REQUEST);

      expectWellShapedObservation(observation);
    });

    it('resolves for a request without an explicit frame', async () => {
      const observation = await options
        .createPort()
        .detect({ ...VALID_COMPONENT_CONTEXT_REQUEST, frameId: null });

      expectWellShapedObservation(observation);
    });

    it('never throws, even for an impossible request', async () => {
      const observation = await options
        .createPort()
        .detect({ tabId: -1, frameId: null, fingerprint: '' });

      expectWellShapedObservation(observation);
    });
  });
}
