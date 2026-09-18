// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { detectPageComponentContext } from '@adapters/frameworks/react/react-component-context';

type Fiber = Record<string, unknown>;

function namedType(name: string): Record<string, unknown> {
  return { displayName: name };
}

function fiber(overrides: Fiber = {}): Fiber {
  return { type: null, return: null, ...overrides };
}

function namedFiber(name: string, overrides: Fiber = {}): Fiber {
  return fiber({ type: namedType(name), ...overrides });
}

function attachFiber(element: Element, value: Fiber): void {
  (element as unknown as Record<string, unknown>)['__reactFiber$test'] = value;
}

function mountButton(): HTMLButtonElement {
  document.body.innerHTML = '<main><button type="button">Save</button></main>';
  const button = document.querySelector('button');
  if (button === null) {
    throw new Error('fixture button missing');
  }
  return button;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as Record<string, unknown>)['__NEXT_DATA__'];
});

describe('detectPageComponentContext', () => {
  it('detects the nearest component and its ancestor chain from development metadata', () => {
    const button = mountButton();
    const app = namedFiber('App', { _debugOwner: null });
    const page = namedFiber('PricingPage', { return: app });
    const card = namedFiber('PricingCard', { return: page, _debugSource: null });
    const host = fiber({ type: 'button', return: card, _debugOwner: null });
    attachFiber(button, host);

    expect(detectPageComponentContext('main > button')).toEqual({
      framework: 'react',
      componentName: 'PricingCard',
      componentChain: ['App', 'PricingPage', 'PricingCard'],
      confidence: 'confirmed',
      sourceReference: null,
    });
  });

  it('marks production-like metadata as inferred, never confirmed', () => {
    const button = mountButton();
    const root = namedFiber('t');
    const parent = namedFiber('Yt', { return: root });
    attachFiber(button, fiber({ type: 'button', return: parent }));
    button.id = 'save';

    expect(detectPageComponentContext('#save')).toEqual({
      framework: 'react',
      componentName: 'Yt',
      componentChain: ['t', 'Yt'],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('reports React ownership without a component name when fibers are anonymous', () => {
    const button = mountButton();
    button.id = 'save';
    attachFiber(button, fiber({ type: 'button', _debugOwner: null }));

    expect(detectPageComponentContext('#save')).toEqual({
      framework: 'react',
      componentName: null,
      componentChain: [],
      confidence: 'confirmed',
      sourceReference: null,
    });
  });

  it('finds React metadata on the closest rendered ancestor', () => {
    mountButton();
    const main = document.querySelector('main');
    if (main === null) {
      throw new Error('fixture main missing');
    }
    attachFiber(main, fiber({ type: 'main', return: namedFiber('App', { _debugOwner: null }) }));

    expect(detectPageComponentContext('button')).toMatchObject({
      framework: 'react',
      componentName: 'App',
      confidence: 'confirmed',
      sourceReference: null,
    });
  });

  it('unwraps memo and forwardRef component types', () => {
    const button = mountButton();
    button.id = 'save';
    const memoCard = fiber({
      type: { $$typeof: Symbol.for('react.memo'), type: namedType('MemoCard') },
      return: fiber({
        type: {
          $$typeof: Symbol.for('react.memo'),
          type: { $$typeof: Symbol.for('react.forward_ref'), render: namedType('ForwardCard') },
        },
      }),
    });
    attachFiber(button, fiber({ type: 'button', return: memoCard }));

    expect(detectPageComponentContext('#save')).toMatchObject({
      componentName: 'MemoCard',
      componentChain: ['ForwardCard', 'MemoCard'],
    });
  });

  it('reads the React root container when the pinned node is the container itself', () => {
    document.body.innerHTML = '<div id="root"></div>';
    (document.querySelector('#root') as unknown as Record<string, unknown>)['__reactContainer$test'] =
      fiber({ type: null, child: namedFiber('App', { _debugOwner: null }) });

    expect(detectPageComponentContext('#root')).toEqual({
      framework: 'react',
      componentName: 'App',
      componentChain: ['App'],
      confidence: 'confirmed',
      sourceReference: null,
    });
  });

  it('returns an explicit unavailable observation without React metadata', () => {
    const button = mountButton();
    button.id = 'save';

    expect(detectPageComponentContext('#save')).toEqual({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    });
  });

  it('uses the Next.js runtime payload as an inferred fallback outside the React tree', () => {
    const button = mountButton();
    button.id = 'save';
    (window as unknown as Record<string, unknown>)['__NEXT_DATA__'] = { page: '/pricing' };

    expect(detectPageComponentContext('#save')).toEqual({
      framework: 'react',
      componentName: null,
      componentChain: [],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('degrades gracefully for a missing element or an invalid selector', () => {
    expect(detectPageComponentContext('#missing')).toEqual({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    });
    expect(detectPageComponentContext('>>> not a selector')).toMatchObject({
      confidence: 'unavailable',
      sourceReference: null,
    });
    expect(detectPageComponentContext('   ')).toMatchObject({ confidence: 'unavailable' });
  });

  it('never throws on hostile metadata and bounds the reported chain', () => {
    const button = mountButton();
    button.id = 'save';
    const root = namedFiber('Root');
    let current: Fiber = root;
    for (let index = 0; index < 20; index += 1) {
      current = namedFiber(`Level${String(index)}`, { return: current, _debugOwner: null });
    }
    attachFiber(button, fiber({ type: 'button', return: current }));

    const observation = detectPageComponentContext('#save');

    expect(observation.framework).toBe('react');
    expect(observation.componentChain).toHaveLength(8);
    expect(observation.componentName).toBe('Level19');
  });

  it('never throws on a hostile expando getter', () => {
    const button = mountButton();
    button.id = 'save';
    Object.defineProperty(button, '__reactFiber$hostile', {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error('hostile');
      },
    });

    expect(() => detectPageComponentContext('#save')).not.toThrow();
    expect(detectPageComponentContext('#save').confidence).toBe('unavailable');
  });

  it('never loops on a cyclic fiber chain', () => {
    const button = mountButton();
    button.id = 'save';
    const first: Fiber = { type: namedType('First') };
    const second: Fiber = { type: namedType('Second'), return: first };
    first['return'] = second;
    attachFiber(button, first);

    const observation = detectPageComponentContext('#save');

    expect(observation.framework).toBe('react');
    expect(observation.componentChain.length).toBeLessThanOrEqual(8);
  });

  it('reads the development source reference of the nearest component', () => {
    const button = mountButton();
    button.id = 'save';
    const card = namedFiber('PricingCard', {
      _debugSource: {
        fileName: 'webpack-internal:///./src/PricingCard.tsx',
        lineNumber: 12,
        // Babel exposes a 0-based column; evidence stores 1-based positions.
        columnNumber: 4,
      },
    });
    attachFiber(button, fiber({ type: 'button', return: card }));

    expect(detectPageComponentContext('#save')).toEqual({
      framework: 'react',
      componentName: 'PricingCard',
      componentChain: ['PricingCard'],
      confidence: 'confirmed',
      sourceReference: {
        fileName: 'webpack-internal:///./src/PricingCard.tsx',
        line: 12,
        column: 5,
      },
    });
  });

  it('takes the source reference of an ancestor when the nearest one has none', () => {
    const button = mountButton();
    button.id = 'save';
    const page = namedFiber('PricingPage', {
      _debugSource: { fileName: '/src/pages/pricing.tsx', lineNumber: 8, columnNumber: 0 },
    });
    const card = namedFiber('PricingCard', { return: page });
    attachFiber(button, fiber({ type: 'button', return: card }));

    expect(detectPageComponentContext('#save').sourceReference).toEqual({
      fileName: '/src/pages/pricing.tsx',
      line: 8,
      column: 1,
    });
  });

  it('ignores unusable source reference fields instead of reporting them', () => {
    const button = mountButton();
    button.id = 'save';
    attachFiber(
      button,
      fiber({
        type: namedFiber('Card'),
        _debugSource: { fileName: '   ', lineNumber: 0, columnNumber: -2 },
      }),
    );

    expect(detectPageComponentContext('#save').sourceReference).toBeNull();
  });

  it('bounds a page-provided source file name', () => {
    const button = mountButton();
    button.id = 'save';
    attachFiber(
      button,
      fiber({
        type: namedFiber('Card'),
        _debugSource: { fileName: 'S'.repeat(900), lineNumber: 1, columnNumber: 0 },
      }),
    );

    const reference = detectPageComponentContext('#save').sourceReference;
    expect(reference?.fileName.length).toBe(512);
  });

  it('keeps the component context when the source reference getter is hostile', () => {
    const button = mountButton();
    button.id = 'save';
    const card = namedFiber('PricingCard');
    Object.defineProperty(card, '_debugSource', {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error('hostile source');
      },
    });
    attachFiber(button, fiber({ type: 'button', return: card }));

    const observation = detectPageComponentContext('#save');

    expect(observation.componentName).toBe('PricingCard');
    expect(observation.sourceReference).toBeNull();
  });
});
