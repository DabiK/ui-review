import { afterEach, describe, expect, it, vi } from 'vitest';
import { unavailableFrameworkObservation, type FrameworkObservation } from '@core';
import {
  ChromeComponentContextAdapter,
  selectFrameworkObservation,
} from '../../src/adapters/chrome/component-context';
import { detectPageComponentContext } from '@adapters/frameworks/react/react-component-context';
import { detectPageVueComponentContext } from '@adapters/frameworks/vue/vue-component-context';
import {
  VALID_COMPONENT_CONTEXT_REQUEST,
  describeComponentContextPortContract,
} from './component-context.contract';

const REACT_OBSERVATION: FrameworkObservation = {
  framework: 'react',
  componentName: 'PricingCard',
  componentChain: ['PricingPage', 'PricingCard'],
  confidence: 'confirmed',
  sourceReference: {
    fileName: 'webpack-internal:///./src/PricingCard.tsx',
    line: 12,
    column: 5,
  },
};

const VUE_OBSERVATION: FrameworkObservation = {
  framework: 'vue',
  componentName: 'VueCard',
  componentChain: ['VuePage', 'VueCard'],
  confidence: 'confirmed',
  sourceReference: {
    fileName: 'src/components/VueCard.vue',
    line: null,
    column: null,
  },
};

type ExecuteScriptMock = ReturnType<typeof vi.fn>;
type ExecuteScriptOptions = { readonly func: unknown };

function installChrome(executeScript: ExecuteScriptMock): void {
  (globalThis as { chrome?: unknown }).chrome = { scripting: { executeScript } };
}

function executeScriptByFunction(results: ReadonlyMap<unknown, unknown>): ExecuteScriptMock {
  const executeScript = vi.fn(async (options: ExecuteScriptOptions) => [
    { result: results.get(options.func) },
  ]);
  installChrome(executeScript);
  return executeScript;
}

/** Both detectors answer, so the default composition is exercised end to end. */
function executeScriptReturning(result: unknown): ExecuteScriptMock {
  return executeScriptByFunction(
    new Map([
      [detectPageComponentContext, result],
      [detectPageVueComponentContext, result],
    ]),
  );
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describeComponentContextPortContract({
  createPort: () => {
    installChrome(executeScriptReturning(REACT_OBSERVATION));
    return new ChromeComponentContextAdapter();
  },
});

describe('selectFrameworkObservation', () => {
  it('returns an explicit unavailable observation when nothing was observed', () => {
    expect(selectFrameworkObservation([])).toEqual(unavailableFrameworkObservation());
  });

  it('ranks confirmed over inferred over unavailable and keeps the first on a tie', () => {
    const inferredReact = { ...REACT_OBSERVATION, confidence: 'inferred' as const };
    const inferredVue = { ...VUE_OBSERVATION, confidence: 'inferred' as const };

    expect(selectFrameworkObservation([unavailableFrameworkObservation(), VUE_OBSERVATION])).toBe(
      VUE_OBSERVATION,
    );
    expect(selectFrameworkObservation([inferredReact, VUE_OBSERVATION])).toBe(VUE_OBSERVATION);
    expect(selectFrameworkObservation([inferredReact, inferredVue])).toBe(inferredReact);
  });
});

describe('ChromeComponentContextAdapter', () => {
  it('runs every page detector in the main world of the reported frame', async () => {
    const executeScript = executeScriptByFunction(
      new Map([
        [detectPageComponentContext, REACT_OBSERVATION],
        [detectPageVueComponentContext, VUE_OBSERVATION],
      ]),
    );

    const observation = await new ChromeComponentContextAdapter().detect(
      VALID_COMPONENT_CONTEXT_REQUEST,
    );

    expect(observation).toEqual(REACT_OBSERVATION);
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 7, frameIds: [0] },
      world: 'MAIN',
      func: detectPageComponentContext,
      args: ['main > button'],
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 7, frameIds: [0] },
      world: 'MAIN',
      func: detectPageVueComponentContext,
      args: ['main > button'],
    });
  });

  it('targets the main frame when the sender had no frame id', async () => {
    const executeScript = executeScriptReturning(REACT_OBSERVATION);

    await new ChromeComponentContextAdapter().detect({
      ...VALID_COMPONENT_CONTEXT_REQUEST,
      frameId: null,
    });

    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 } }),
    );
  });

  it('keeps a confirmed observation over an inferred one', async () => {
    executeScriptByFunction(
      new Map([
        [detectPageComponentContext, { ...REACT_OBSERVATION, confidence: 'inferred' }],
        [detectPageVueComponentContext, VUE_OBSERVATION],
      ]),
    );

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toEqual(VUE_OBSERVATION);
  });

  it('degrades a failing detector without losing the other observation', async () => {
    const executeScript = vi.fn(async (options: ExecuteScriptOptions) => {
      if (options.func === detectPageComponentContext) {
        throw new Error('frame was removed');
      }
      return [{ result: VUE_OBSERVATION }];
    });
    installChrome(executeScript);

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toEqual(VUE_OBSERVATION);
  });

  it('rejects a page result that does not match the observation vocabulary', async () => {
    executeScriptByFunction(
      new Map<unknown, unknown>([
        [detectPageComponentContext, { framework: 'angular', confidence: 'certain' }],
        [detectPageVueComponentContext, VUE_OBSERVATION],
      ]),
    );

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toEqual(VUE_OBSERVATION);
  });

  it('rejects a page result with a malformed source reference', async () => {
    executeScriptReturning({
      ...REACT_OBSERVATION,
      sourceReference: { fileName: 'src/App.tsx', line: 0, column: -1 },
    });

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toMatchObject({ confidence: 'unavailable', sourceReference: null });
  });

  it('degrades a transport failure into an explicit unavailable observation', async () => {
    const executeScript = vi.fn(async () => {
      throw new Error('frame was removed');
    });
    installChrome(executeScript);

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toMatchObject({ confidence: 'unavailable' });
  });

  it('degrades an empty injection result into an explicit unavailable observation', async () => {
    executeScriptReturning(undefined);

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toMatchObject({ confidence: 'unavailable' });
  });

  it('accepts an explicit detector list', async () => {
    const executeScript = executeScriptByFunction(
      new Map([[detectPageVueComponentContext, VUE_OBSERVATION]]),
    );

    const observation = await new ChromeComponentContextAdapter([
      detectPageVueComponentContext,
    ]).detect(VALID_COMPONENT_CONTEXT_REQUEST);

    expect(observation).toEqual(VUE_OBSERVATION);
    expect(executeScript).toHaveBeenCalledTimes(1);
  });
});
