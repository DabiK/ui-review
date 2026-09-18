// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { detectPageVueComponentContext } from '@adapters/frameworks/vue/vue-component-context';

type VueRecord = Record<string, unknown>;

/** Development SFC component options: `__name` plus the source file set by the compiler. */
function sfc(name: string, extra: VueRecord = {}): VueRecord {
  return { __name: name, __file: `src/components/${name}.vue`, ...extra };
}

function instance(type: unknown, parent: unknown = null): VueRecord {
  return { type, parent };
}

function attach(element: Element, key: string, value: unknown): void {
  (element as unknown as VueRecord)[key] = value;
}

function mountButton(): HTMLButtonElement {
  document.body.innerHTML = '<main id="app-root"><button type="button" id="save">Save</button></main>';
  const button = document.querySelector('button');
  if (button === null) {
    throw new Error('fixture button missing');
  }
  return button;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as VueRecord)['__NUXT__'];
});

describe('detectPageVueComponentContext', () => {
  it('detects the nearest component and its ancestor chain from development metadata', () => {
    const button = mountButton();
    const app = instance(sfc('App'));
    const page = instance(sfc('PricingPage'), app);
    const card = instance(sfc('PricingCard'), page);
    attach(button, '__vueParentComponent', card);

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'PricingCard',
      componentChain: ['App', 'PricingPage', 'PricingCard'],
      confidence: 'confirmed',
      sourceReference: {
        fileName: 'src/components/PricingCard.vue',
        line: null,
        column: null,
      },
    });
  });

  it('marks production-like metadata as inferred, never confirmed', () => {
    const button = mountButton();
    const root = instance({ name: 't' });
    const parent = instance({ name: 'Yt' }, root);
    attach(button, '__vueParentComponent', parent);

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'Yt',
      componentChain: ['t', 'Yt'],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('reports Vue ownership without a component name when the instance is anonymous', () => {
    const button = mountButton();
    attach(button, '__vueParentComponent', instance({}));

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: null,
      componentChain: [],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('reads a Vue 2 instance and its parent chain through $options', () => {
    const button = mountButton();
    const app = {
      $options: { name: 'App', __file: 'src/App.vue' },
      $parent: null,
    };
    const card = {
      $options: { name: 'VueCard', __file: 'src/components/VueCard.vue' },
      $parent: app,
    };
    attach(button, '__vue__', card);

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'VueCard',
      componentChain: ['App', 'VueCard'],
      confidence: 'confirmed',
      sourceReference: { fileName: 'src/components/VueCard.vue', line: null, column: null },
    });
  });

  it('marks a Vue 2 production instance as inferred', () => {
    const button = mountButton();
    attach(button, '__vue__', { $options: { name: 'VueCard' }, $parent: null });

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'VueCard',
      componentChain: ['VueCard'],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('ignores a page element that only pretends to be a Vue 2 instance', () => {
    const button = mountButton();
    attach(button, '__vue__', { some: 'value' });

    expect(detectPageVueComponentContext('#save')).toMatchObject({
      confidence: 'unavailable',
      framework: 'unknown',
    });
  });

  it('falls back to the mounted app root when no element instance is exposed', () => {
    mountButton();
    const container = document.querySelector('#app-root');
    if (container === null) {
      throw new Error('fixture container missing');
    }
    attach(container, '__vue_app__', { _component: { name: 'App' }, _instance: null });

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'App',
      componentChain: ['App'],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('reports the app root as confirmed when its development file is exposed', () => {
    mountButton();
    const container = document.querySelector('#app-root');
    if (container === null) {
      throw new Error('fixture container missing');
    }
    attach(container, '__vue_app__', { _component: sfc('App'), _instance: null });

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: 'App',
      componentChain: ['App'],
      confidence: 'confirmed',
      sourceReference: { fileName: 'src/components/App.vue', line: null, column: null },
    });
  });

  it('falls back to a Nuxt payload when the element is outside the Vue tree', () => {
    mountButton();
    (window as unknown as VueRecord)['__NUXT__'] = { data: {} };

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'vue',
      componentName: null,
      componentChain: [],
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('finds Vue metadata on the closest rendered ancestor', () => {
    mountButton();
    const main = document.querySelector('main');
    if (main === null) {
      throw new Error('fixture main missing');
    }
    attach(main, '__vueParentComponent', instance(sfc('App')));

    expect(detectPageVueComponentContext('button')).toMatchObject({
      framework: 'vue',
      componentName: 'App',
      confidence: 'confirmed',
      sourceReference: { fileName: 'src/components/App.vue', line: null, column: null },
    });
  });

  it('prefers the nearest instance over a farther ancestor instance', () => {
    const button = mountButton();
    const main = document.querySelector('main');
    if (main === null) {
      throw new Error('fixture main missing');
    }
    attach(button, '__vueParentComponent', instance(sfc('Card')));
    attach(main, '__vueParentComponent', instance(sfc('App')));

    expect(detectPageVueComponentContext('#save')).toMatchObject({
      componentName: 'Card',
      confidence: 'confirmed',
    });
  });

  it('reads functional component names', () => {
    const button = mountButton();
    function Card(): void {
      // Fixture functional component: only its function name is available.
    }
    attach(button, '__vueParentComponent', instance(Card));

    expect(detectPageVueComponentContext('#save')).toMatchObject({
      framework: 'vue',
      componentName: 'Card',
      confidence: 'inferred',
    });
  });

  it('caps the ancestor chain at eight components', () => {
    const button = mountButton();
    let current = instance(sfc('Component0'));
    for (let index = 1; index < 12; index += 1) {
      current = instance(sfc(`Component${index}`), current);
    }
    attach(button, '__vueParentComponent', current);

    const observation = detectPageVueComponentContext('#save');
    expect(observation.componentChain).toHaveLength(8);
    expect(observation.componentName).toBe('Component11');
    expect(observation.componentChain).toEqual([
      'Component4',
      'Component5',
      'Component6',
      'Component7',
      'Component8',
      'Component9',
      'Component10',
      'Component11',
    ]);
  });

  it('caps long component names and source files', () => {
    const button = mountButton();
    const longName = 'N'.repeat(400);
    const longFile = `src/components/${'f'.repeat(900)}.vue`;
    attach(button, '__vueParentComponent', instance({ __name: longName, __file: longFile }));

    const observation = detectPageVueComponentContext('#save');
    expect(observation.componentName).toHaveLength(120);
    expect(observation.sourceReference?.fileName).toHaveLength(512);
  });

  it('stops on a cyclic parent chain instead of looping forever', () => {
    const button = mountButton();
    const first = instance(sfc('A'));
    const second = instance(sfc('B'), first);
    first['parent'] = second;
    attach(button, '__vueParentComponent', second);

    const observation = detectPageVueComponentContext('#save');
    expect(observation.componentName).toBe('B');
    expect(observation.componentChain).toHaveLength(8);
    expect(observation.confidence).toBe('confirmed');
  });

  it('survives a hostile expando getter', () => {
    const button = mountButton();
    Object.defineProperty(button, '__vueParentComponent', {
      configurable: true,
      get() {
        throw new Error('hostile page');
      },
    });

    expect(detectPageVueComponentContext('#save')).toMatchObject({
      framework: 'unknown',
      confidence: 'unavailable',
    });
  });

  it('keeps the component context when only the development file getter is hostile', () => {
    const button = mountButton();
    const hostileType = {
      __name: 'Card',
      get __file(): string {
        throw new Error('hostile page');
      },
    };
    attach(button, '__vueParentComponent', instance(hostileType));

    expect(detectPageVueComponentContext('#save')).toMatchObject({
      framework: 'vue',
      componentName: 'Card',
      confidence: 'inferred',
      sourceReference: null,
    });
  });

  it('degrades a missing element, an invalid selector and a blank fingerprint', () => {
    mountButton();

    expect(detectPageVueComponentContext('#missing')).toMatchObject({ confidence: 'unavailable' });
    expect(detectPageVueComponentContext('::not-a-selector')).toMatchObject({
      confidence: 'unavailable',
    });
    expect(detectPageVueComponentContext('')).toMatchObject({ confidence: 'unavailable' });
  });

  it('does not claim a framework on a page without Vue metadata', () => {
    mountButton();

    expect(detectPageVueComponentContext('#save')).toEqual({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    });
  });
});
