import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameworkObservation } from '@core';
import { ChromeComponentContextAdapter } from '../../src/adapters/chrome/component-context';
import { detectPageComponentContext } from '@adapters/frameworks/react/react-component-context';
import {
  VALID_COMPONENT_CONTEXT_REQUEST,
  describeComponentContextPortContract,
} from './component-context.contract';

const OBSERVATION: FrameworkObservation = {
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

type ExecuteScriptMock = ReturnType<typeof vi.fn>;

function installChrome(executeScript: ExecuteScriptMock): void {
  (globalThis as { chrome?: unknown }).chrome = { scripting: { executeScript } };
}

function executeScriptReturning(result: unknown): ExecuteScriptMock {
  const executeScript = vi.fn(async () => [{ result }]);
  installChrome(executeScript);
  return executeScript;
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describeComponentContextPortContract({
  createPort: () => {
    installChrome(executeScriptReturning(OBSERVATION));
    return new ChromeComponentContextAdapter();
  },
});

describe('ChromeComponentContextAdapter', () => {
  it('runs the page detector in the main world of the reported frame', async () => {
    const executeScript = executeScriptReturning(OBSERVATION);

    const observation = await new ChromeComponentContextAdapter().detect(
      VALID_COMPONENT_CONTEXT_REQUEST,
    );

    expect(observation).toEqual(OBSERVATION);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: [0] },
      world: 'MAIN',
      func: detectPageComponentContext,
      args: ['main > button'],
    });
  });

  it('targets the main frame when the sender had no frame id', async () => {
    const executeScript = executeScriptReturning(OBSERVATION);

    await new ChromeComponentContextAdapter().detect({
      ...VALID_COMPONENT_CONTEXT_REQUEST,
      frameId: null,
    });

    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 7 } }),
    );
  });

  it('rejects a page result that does not match the observation vocabulary', async () => {
    executeScriptReturning({ framework: 'angular', confidence: 'certain' });

    await expect(
      new ChromeComponentContextAdapter().detect(VALID_COMPONENT_CONTEXT_REQUEST),
    ).resolves.toEqual({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    });
  });

  it('rejects a page result with a malformed source reference', async () => {
    executeScriptReturning({
      ...OBSERVATION,
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
});
