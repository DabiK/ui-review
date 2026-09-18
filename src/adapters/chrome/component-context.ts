import {
  unavailableFrameworkObservation,
  type ComponentContextPort,
  type ComponentContextRequest,
  type FrameworkObservation,
} from '@core';
import { detectPageComponentContext } from '@adapters/frameworks/react/react-component-context';

/**
 * Chrome adapter for framework component context. The detection function must run in the
 * page's main world (`world: 'MAIN'`): React's expando fibers are invisible from the
 * isolated world of a content script. It is executed on demand, only when a capture asks
 * for it, so no page is ever inspected before a review session is active.
 *
 * The returned value crosses back from the page, so it is validated before it re-enters the
 * extension; any transport, frame or vocabulary failure becomes an explicit `unavailable`
 * observation instead of an exception.
 */
export class ChromeComponentContextAdapter implements ComponentContextPort {
  async detect(request: ComponentContextRequest): Promise<FrameworkObservation> {
    try {
      const results = await chrome.scripting.executeScript({
        target: {
          tabId: request.tabId,
          ...(request.frameId === null ? {} : { frameIds: [request.frameId] }),
        },
        world: 'MAIN',
        func: detectPageComponentContext,
        args: [request.fingerprint],
      });

      const result: unknown = results[0]?.result;
      return isFrameworkObservation(result) ? result : unavailableFrameworkObservation();
    } catch {
      return unavailableFrameworkObservation();
    }
  }
}

function isFrameworkObservation(value: unknown): value is FrameworkObservation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const framework = candidate['framework'];
  const confidence = candidate['confidence'];
  const componentName = candidate['componentName'];
  const componentChain = candidate['componentChain'];

  return (
    (framework === 'react' || framework === 'vue' || framework === 'unknown') &&
    (confidence === 'confirmed' || confidence === 'inferred' || confidence === 'unavailable') &&
    (componentName === null || typeof componentName === 'string') &&
    Array.isArray(componentChain) &&
    componentChain.every((entry) => typeof entry === 'string') &&
    isSourceReference(candidate['sourceReference'])
  );
}

function isSourceReference(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object' || value === undefined) {
    return false;
  }

  const reference = value as Record<string, unknown>;
  const fileName = reference['fileName'];
  const line = reference['line'];
  const column = reference['column'];
  return (
    typeof fileName === 'string' &&
    (line === null || (typeof line === 'number' && Number.isInteger(line) && line >= 1)) &&
    (column === null || (typeof column === 'number' && Number.isInteger(column) && column >= 1))
  );
}
