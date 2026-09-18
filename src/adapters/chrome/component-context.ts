import {
  unavailableFrameworkObservation,
  type ComponentContextPort,
  type ComponentContextRequest,
  type Confidence,
  type FrameworkObservation,
} from '@core';
import { detectPageComponentContext } from '@adapters/frameworks/react/react-component-context';
import { detectPageVueComponentContext } from '@adapters/frameworks/vue/vue-component-context';

/**
 * A self-contained page detector, serialized by `chrome.scripting.executeScript` and run in
 * the inspected page's main world.
 */
export type FrameworkPageDetector = (fingerprint: string) => FrameworkObservation;

const CONFIDENCE_RANK: Record<Confidence, number> = {
  confirmed: 0,
  inferred: 1,
  unavailable: 2,
};

const DEFAULT_DETECTORS: readonly FrameworkPageDetector[] = [
  detectPageComponentContext,
  detectPageVueComponentContext,
];

/**
 * Picks the best observation of several framework detectors: an explicit failure never wins
 * over a detection, `confirmed` beats `inferred`, and a tie keeps the detector order.
 */
export function selectFrameworkObservation(
  observations: readonly FrameworkObservation[],
): FrameworkObservation {
  let best: FrameworkObservation | null = null;
  for (const observation of observations) {
    if (
      best === null ||
      CONFIDENCE_RANK[observation.confidence] < CONFIDENCE_RANK[best.confidence]
    ) {
      best = observation;
    }
  }
  return best ?? unavailableFrameworkObservation();
}

/**
 * Chrome adapter for framework component context. Detection functions must run in the page's
 * main world (`world: 'MAIN'`): React fibers and Vue parent-component expandos are invisible
 * from the isolated world of a content script. They are executed on demand, only when a
 * capture asks for it, so no page is ever inspected before a review session is active.
 *
 * Every detector observes independently and each returned value crosses back from the page,
 * so it is validated before it re-enters the extension. The best available observation is
 * kept; any transport, frame or vocabulary failure becomes an explicit `unavailable`
 * observation instead of an exception.
 */
export class ChromeComponentContextAdapter implements ComponentContextPort {
  private readonly detectors: readonly FrameworkPageDetector[];

  constructor(detectors: readonly FrameworkPageDetector[] = DEFAULT_DETECTORS) {
    this.detectors = [...detectors];
  }

  async detect(request: ComponentContextRequest): Promise<FrameworkObservation> {
    const observations = await Promise.all(
      this.detectors.map((detector) => this.runDetector(detector, request)),
    );
    return selectFrameworkObservation(observations);
  }

  private async runDetector(
    detector: FrameworkPageDetector,
    request: ComponentContextRequest,
  ): Promise<FrameworkObservation> {
    try {
      const results = await chrome.scripting.executeScript({
        target: {
          tabId: request.tabId,
          ...(request.frameId === null ? {} : { frameIds: [request.frameId] }),
        },
        world: 'MAIN',
        func: detector,
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
