import type { FrameworkObservation, SourceReference } from '@core';

/**
 * Best-effort Vue and Nuxt component context, executed inside the inspected page.
 *
 * Vue 3 attaches the component instance that rendered an element as a JavaScript expando
 * (`__vueParentComponent`, plus `__vnode`) when development metadata is available; Vue 2
 * attaches `__vue__` to a component's root element. Those properties only exist in the
 * page's own JavaScript world, so this function is serialized by
 * `chrome.scripting.executeScript` and runs there (`world: 'MAIN'`): a content script's
 * isolated world would never see them.
 *
 * Because the function is serialized, it must stay entirely self-contained — no import,
 * closure or module constant is available at execution time. It also never throws: any
 * failure degrades to an explicit `unavailable` observation.
 *
 * Confidence is driven by development metadata, not by names: an SFC compiled in
 * development carries `__file`/`__hmrId`, so the component found there is directly observed
 * (`confirmed`). Production-like metadata (minified or runtime `name`/`__name`, an app root
 * reached through `__vue_app__`) is reported as `inferred`. A `__NUXT__` payload is the same
 * explicit `inferred` fallback when the clicked node is outside the Vue tree.
 *
 * The raw `__file` reference (fileName only, no line) is passed along so the source-map
 * adapter can keep or resolve it; it carries no confidence by itself.
 */
export function detectPageVueComponentContext(fingerprint: string): FrameworkObservation {
  type VueRecord = Record<string, unknown>;

  const MAX_DOM_ANCESTORS = 50;
  const MAX_COMPONENT_STEPS = 200;
  const MAX_COMPONENT_CHAIN = 8;
  const MAX_COMPONENT_NAME_LENGTH = 120;
  const MAX_SOURCE_FILE_LENGTH = 512;
  /** Vue 3 SFC options expose the auto-inferred name first, then the author's name. */
  const VUE3_NAME_KEYS = ['__name', 'name', 'displayName'];
  /** Vue 2 options keep the author's name and the file-inferred tag. */
  const VUE2_NAME_KEYS = ['name', 'displayName', '_componentTag'];

  function unavailable(): FrameworkObservation {
    return {
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
      sourceReference: null,
    };
  }

  function isRecord(value: unknown): value is VueRecord {
    return typeof value === 'object' && value !== null;
  }

  /**
   * Reads one property of untrusted page data. Framework internals can be hostile getters:
   * any failure only loses that field, never the whole observation.
   */
  function safeRead(record: VueRecord, key: string): unknown {
    try {
      return record[key];
    } catch {
      return undefined;
    }
  }

  function cleanName(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const collapsed = value.trim().replace(/\s+/g, ' ');
    if (collapsed === '') {
      return null;
    }
    return collapsed.slice(0, MAX_COMPONENT_NAME_LENGTH);
  }

  function readName(record: VueRecord, keys: readonly string[]): string | null {
    for (const key of keys) {
      const name = cleanName(safeRead(record, key));
      if (name !== null) {
        return name;
      }
    }
    return null;
  }

  /** Vue 3 component options are usually objects; functional components are functions. */
  function nameOfType(type: unknown): string | null {
    if (typeof type === 'function') {
      return readName(type as unknown as VueRecord, ['displayName', 'name']);
    }
    if (!isRecord(type)) {
      return null;
    }
    return readName(type, VUE3_NAME_KEYS);
  }

  /** Development SFC metadata: `__file` names the source component, `__hmrId` marks HMR. */
  function readDevFile(type: unknown): string | null {
    if (!isRecord(type)) {
      return null;
    }
    const file = safeRead(type, '__file');
    if (typeof file !== 'string' || file.trim() === '') {
      return null;
    }
    return file.slice(0, MAX_SOURCE_FILE_LENGTH);
  }

  function isDevelopmentType(type: unknown): boolean {
    if (readDevFile(type) !== null) {
      return true;
    }
    if (!isRecord(type)) {
      return false;
    }
    const hmrId = safeRead(type, '__hmrId');
    return typeof hmrId === 'string' && hmrId.trim() !== '';
  }

  function sourceReferenceFor(file: string | null): SourceReference | null {
    return file === null ? null : { fileName: file, line: null, column: null };
  }

  function readVue3Instance(element: Element): VueRecord | null {
    let value: unknown;
    try {
      value = (element as unknown as VueRecord)['__vueParentComponent'];
    } catch {
      return null;
    }
    return isRecord(value) ? value : null;
  }

  function readVue2Instance(element: Element): VueRecord | null {
    let value: unknown;
    try {
      value = (element as unknown as VueRecord)['__vue__'];
    } catch {
      return null;
    }
    if (!isRecord(value) || !isRecord(safeRead(value, '$options'))) {
      return null;
    }
    return value;
  }

  interface ComponentWalk {
    readonly nearest: string | null;
    readonly chain: readonly string[];
    readonly development: boolean;
    readonly sourceFile: string | null;
  }

  function collectChain(
    start: VueRecord,
    nameOf: (current: VueRecord) => string | null,
    fileOf: (current: VueRecord) => string | null,
    devOf: (current: VueRecord) => boolean,
    parentOf: (current: VueRecord) => unknown,
  ): ComponentWalk {
    const nearestFirst: string[] = [];
    let current: unknown = start;
    let steps = 0;
    let development = false;
    let sourceFile: string | null = null;

    while (isRecord(current) && steps < MAX_COMPONENT_STEPS) {
      if (devOf(current)) {
        development = true;
      }
      if (sourceFile === null) {
        sourceFile = fileOf(current);
      }
      const name = nameOf(current);
      if (name !== null && nearestFirst[nearestFirst.length - 1] !== name) {
        nearestFirst.push(name);
      }
      current = parentOf(current);
      steps += 1;
    }

    return {
      nearest: nearestFirst[0] ?? null,
      chain: nearestFirst.slice(0, MAX_COMPONENT_CHAIN).reverse(),
      development,
      sourceFile,
    };
  }

  function walkVue3(start: VueRecord): ComponentWalk {
    return collectChain(
      start,
      (current) => nameOfType(safeRead(current, 'type')),
      (current) => readDevFile(safeRead(current, 'type')),
      (current) => isDevelopmentType(safeRead(current, 'type')),
      (current) => safeRead(current, 'parent'),
    );
  }

  function walkVue2(start: VueRecord): ComponentWalk {
    const optionsOf = (current: VueRecord): VueRecord | null => {
      const options = safeRead(current, '$options');
      return isRecord(options) ? options : null;
    };

    return collectChain(
      start,
      (current) => {
        const options = optionsOf(current);
        return options === null ? null : readName(options, VUE2_NAME_KEYS);
      },
      (current) => {
        const options = optionsOf(current);
        if (options === null) {
          return null;
        }
        const file = safeRead(options, '__file');
        if (typeof file !== 'string' || file.trim() === '') {
          return null;
        }
        return file.slice(0, MAX_SOURCE_FILE_LENGTH);
      },
      (current) => {
        const options = optionsOf(current);
        if (options === null) {
          return false;
        }
        const file = safeRead(options, '__file');
        return typeof file === 'string' && file.trim() !== '';
      },
      (current) => safeRead(current, '$parent'),
    );
  }

  /**
   * Finds the nearest Vue component instance owning the element. Vue 3 stores the rendering
   * component right on the element; Vue 2 stores `__vue__` on the component's root element,
   * so walking the DOM ancestors finds the nearest available one.
   */
  function findInstance(element: Element): { kind: 'vue3' | 'vue2'; instance: VueRecord } | null {
    let current: Element | null = element;
    let steps = 0;
    while (current !== null && steps < MAX_DOM_ANCESTORS) {
      const vue3 = readVue3Instance(current);
      if (vue3 !== null) {
        return { kind: 'vue3', instance: vue3 };
      }
      const vue2 = readVue2Instance(current);
      if (vue2 !== null) {
        return { kind: 'vue2', instance: vue2 };
      }
      current = current.parentElement;
      steps += 1;
    }
    return null;
  }

  /** `__vue_app__` marks the mount container even in builds without devtools expandos. */
  function findMountedApp(element: Element): VueRecord | null {
    let current: Element | null = element;
    let steps = 0;
    while (current !== null && steps < MAX_DOM_ANCESTORS) {
      let value: unknown;
      try {
        value = (current as unknown as VueRecord)['__vue_app__'];
      } catch {
        value = undefined;
      }
      if (isRecord(value)) {
        return value;
      }
      current = current.parentElement;
      steps += 1;
    }
    return null;
  }

  /**
   * Production fallback: only the app root is reachable without devtools expandos. It is
   * reported as the root component (`inferred`) and never presented as the nearest one.
   */
  function rootObservation(app: VueRecord): FrameworkObservation {
    const instance = safeRead(app, '_instance');
    const component = safeRead(app, '_component');
    const type =
      component !== undefined
        ? component
        : isRecord(instance)
          ? safeRead(instance, 'type')
          : undefined;
    const name = nameOfType(type);
    const file = readDevFile(type);
    return {
      framework: 'vue',
      componentName: name,
      componentChain: name === null ? [] : [name],
      confidence: file === null ? 'inferred' : 'confirmed',
      sourceReference: sourceReferenceFor(file),
    };
  }

  function nuxtRuntimeObservation(): FrameworkObservation | null {
    const nuxt = (window as unknown as VueRecord)['__NUXT__'];
    if (!isRecord(nuxt)) {
      return null;
    }
    return {
      framework: 'vue',
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

    const found = findInstance(element);
    if (found !== null) {
      const walk = found.kind === 'vue3' ? walkVue3(found.instance) : walkVue2(found.instance);
      return {
        framework: 'vue',
        componentName: walk.nearest,
        componentChain: walk.chain,
        confidence: walk.development ? 'confirmed' : 'inferred',
        sourceReference: sourceReferenceFor(walk.sourceFile),
      };
    }

    const app = findMountedApp(element);
    if (app !== null) {
      return rootObservation(app);
    }

    return nuxtRuntimeObservation() ?? unavailable();
  } catch {
    return unavailable();
  }
}
