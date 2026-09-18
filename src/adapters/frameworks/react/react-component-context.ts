import type { FrameworkObservation, SourceReference } from '@core';

/**
 * Best-effort React and Next.js component context, executed inside the inspected page.
 *
 * React attaches its internal fiber to every DOM node it renders through an expando key
 * (`__reactFiber$…`, `__reactContainer$…`). Those properties only exist in the page's own
 * JavaScript world, so this function is serialized by `chrome.scripting.executeScript` and
 * runs there (`world: 'MAIN'`): a content script's isolated world would never see them.
 *
 * Because the function is serialized, it must stay entirely self-contained — no import,
 * closure or module constant is available at execution time. It also never throws: any
 * failure degrades to an explicit `unavailable` observation.
 *
 * Confidence is driven by development metadata, not by names: development builds mark every
 * fiber with `_debugOwner`/`_debugSource` (React 19 also uses `_debugInfo`), so a named
 * component found there is directly observed (`confirmed`). Production builds keep only the
 * runtime fields, so whatever name survives minification is reported as `inferred`. Next.js
 * pages are React trees and flow through the same path; a `__NEXT_DATA__` payload is an
 * explicit `inferred` fallback when the clicked node is outside the React tree.
 *
 * The raw `_debugSource` reference (fileName/lineNumber/columnNumber) is passed along so the
 * source-map adapter can resolve it; it carries no confidence by itself.
 */
export function detectPageComponentContext(fingerprint: string): FrameworkObservation {
  type Fiber = Record<string, unknown>;

  const FIBER_KEYS = [/^__reactFiber\$/, /^__reactInternalInstance\$/];
  const CONTAINER_KEY = /^__reactContainer\$/;
  const DEV_ONLY_KEYS = [
    '_debugOwner',
    '_debugSource',
    '_debugInfo',
    '_debugStack',
    '_debugTask',
    '_debugNeedsRemount',
  ];
  const MAX_DOM_ANCESTORS = 50;
  const MAX_FIBER_STEPS = 200;
  const MAX_WRAPPER_DEPTH = 6;
  const MAX_COMPONENT_CHAIN = 8;
  const MAX_COMPONENT_NAME_LENGTH = 120;
  const MAX_SOURCE_FILE_LENGTH = 512;

  function unavailable(): FrameworkObservation {
    return {
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    };
  }

  function isRecord(value: unknown): value is Fiber {
    return typeof value === 'object' && value !== null;
  }

  function cleanName(value: string): string | null {
    const collapsed = value.trim().replace(/\s+/g, ' ');
    if (collapsed === '') {
      return null;
    }
    return collapsed.slice(0, MAX_COMPONENT_NAME_LENGTH);
  }

  function nameOfFunction(value: { displayName?: unknown; name?: unknown }): string | null {
    const displayName = value.displayName;
    if (typeof displayName === 'string') {
      const cleaned = cleanName(displayName);
      if (cleaned !== null) {
        return cleaned;
      }
    }
    const name = value.name;
    return typeof name === 'string' ? cleanName(name) : null;
  }

  function nameOfType(type: unknown, depth: number): string | null {
    if (depth > MAX_WRAPPER_DEPTH) {
      return null;
    }
    if (typeof type === 'function') {
      return nameOfFunction(type as { displayName?: unknown; name?: unknown });
    }
    if (!isRecord(type)) {
      return null;
    }

    const displayName = type['displayName'];
    if (typeof displayName === 'string') {
      const cleaned = cleanName(displayName);
      if (cleaned !== null) {
        return cleaned;
      }
    }

    // `memo(Component)` keeps the inner component under `type`; `forwardRef` under `render`.
    const wrapped = type['type'];
    if (wrapped !== undefined) {
      const name = nameOfType(wrapped, depth + 1);
      if (name !== null) {
        return name;
      }
    }
    const render = type['render'];
    if (render !== undefined) {
      return nameOfType(render, depth + 1);
    }
    return null;
  }

  function componentName(fiber: Fiber): string | null {
    return nameOfType(fiber['type'] ?? fiber['elementType'], 0);
  }

  function hasDevelopmentMarkers(fiber: Fiber): boolean {
    for (const key of DEV_ONLY_KEYS) {
      if (key in fiber) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reads the raw development source location of a fiber. `_debugSource` is untrusted page
   * data and can be a hostile getter: any failure only loses the reference, never the
   * component context.
   */
  function readSourceReference(fiber: Fiber): SourceReference | null {
    let value: unknown;
    try {
      value = fiber['_debugSource'];
    } catch {
      return null;
    }
    if (!isRecord(value)) {
      return null;
    }

    const fileName = value['fileName'];
    if (typeof fileName !== 'string' || fileName.trim() === '') {
      return null;
    }

    const lineNumber = value['lineNumber'];
    const columnNumber = value['columnNumber'];
    return {
      fileName: fileName.slice(0, MAX_SOURCE_FILE_LENGTH),
      line:
        typeof lineNumber === 'number' && Number.isInteger(lineNumber) && lineNumber >= 1
          ? lineNumber
          : null,
      // Babel and React expose a 0-based column; evidence stores 1-based positions.
      column:
        typeof columnNumber === 'number' && Number.isInteger(columnNumber) && columnNumber >= 0
          ? columnNumber + 1
          : null,
    };
  }

  function readFiberRecord(element: Element): Fiber | null {
    const record = element as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!FIBER_KEYS.some((pattern) => pattern.test(key))) {
        continue;
      }
      const fiber = record[key];
      if (isRecord(fiber)) {
        return fiber;
      }
    }
    for (const key of Object.keys(record)) {
      if (!CONTAINER_KEY.test(key)) {
        continue;
      }
      const container = record[key];
      if (isRecord(container)) {
        // A React root container exposes the HostRoot fiber, whose child is the first real
        // element fiber (for example the app root component).
        const child = container['child'];
        return isRecord(child) ? child : container;
      }
    }
    return null;
  }

  function findFiber(element: Element): Fiber | null {
    let current: Element | null = element;
    let steps = 0;
    while (current !== null && steps < MAX_DOM_ANCESTORS) {
      const fiber = readFiberRecord(current);
      if (fiber !== null) {
        return fiber;
      }
      current = current.parentElement;
      steps += 1;
    }
    return null;
  }

  function walkComponents(start: Fiber): {
    readonly nearest: string | null;
    readonly chain: readonly string[];
    readonly development: boolean;
    readonly sourceReference: SourceReference | null;
  } {
    const nearestFirst: string[] = [];
    let current: Fiber | null = start;
    let steps = 0;
    let development = false;
    let sourceReference: SourceReference | null = null;

    while (current !== null && steps < MAX_FIBER_STEPS) {
      if (hasDevelopmentMarkers(current)) {
        development = true;
      }
      if (sourceReference === null) {
        sourceReference = readSourceReference(current);
      }
      const name = componentName(current);
      if (name !== null && nearestFirst[nearestFirst.length - 1] !== name) {
        nearestFirst.push(name);
      }
      const parent: unknown = current['return'];
      current = isRecord(parent) ? parent : null;
      steps += 1;
    }

    return {
      nearest: nearestFirst[0] ?? null,
      chain: nearestFirst.slice(0, MAX_COMPONENT_CHAIN).reverse(),
      development,
      sourceReference,
    };
  }

  function nextRuntimeObservation(): FrameworkObservation | null {
    const nextData = (window as unknown as Record<string, unknown>)['__NEXT_DATA__'];
    if (!isRecord(nextData)) {
      return null;
    }
    return {
      framework: 'react',
      componentName: null,
      componentChain: [],
      confidence: 'inferred',
      sourceReference: null,
    };
  }

  try {
    if (fingerprint.trim() === '') {
      return unavailable();
    }
    const element = document.querySelector(fingerprint);
    if (element === null) {
      return unavailable();
    }

    const fiber = findFiber(element);
    if (fiber === null) {
      return nextRuntimeObservation() ?? unavailable();
    }

    const walk = walkComponents(fiber);
    return {
      framework: 'react',
      componentName: walk.nearest,
      componentChain: walk.chain,
      confidence: walk.development ? 'confirmed' : 'inferred',
      sourceReference: walk.sourceReference,
    };
  } catch {
    return unavailable();
  }
}
