// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFingerprint, captureDomAnchor, resolveAnchor } from '../../src/content/dom-anchor';

function requireElement<T extends Element>(element: T | null, label: string): T {
  if (element === null) {
    throw new Error(`fixture element "${label}" not found`);
  }
  return element;
}

function mockRect(
  element: Element,
  box: { x: number; y: number; width: number; height: number },
): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
    toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildFingerprint', () => {
  it('uses the unique id when the element has one', () => {
    const element = document.createElement('section');
    element.id = 'pricing-card';
    document.body.appendChild(element);

    expect(buildFingerprint(element)).toBe('#pricing-card');
    expect(resolveAnchor('#pricing-card')).toBe(element);
  });

  it('builds a tag path with nth-of-type when there is no id', () => {
    document.body.innerHTML = '<main><ul><li>one</li><li>two</li></ul></main>';
    const second = requireElement(document.querySelectorAll('li')[1] ?? null, 'second li');

    const fingerprint = buildFingerprint(second);

    expect(fingerprint).toContain('li:nth-of-type(2)');
    expect(fingerprint).toContain(' > ');
    expect(resolveAnchor(fingerprint)).toBe(second);
  });

  it('stops on a uniquely identified ancestor instead of the document root', () => {
    document.body.innerHTML =
      '<div id="app"><div class="row"><button type="button">Save</button></div></div>';
    const button = requireElement(document.querySelector('button'), 'button');

    expect(buildFingerprint(button)).toBe('#app > div > button');
  });

  it('does not trust an id shared by several elements', () => {
    document.body.innerHTML = '<div id="card">first</div><div id="card">second</div>';
    const first = requireElement(document.querySelector('#card'), 'first card');

    const fingerprint = buildFingerprint(first);

    expect(fingerprint).not.toBe('#card');
    expect(resolveAnchor(fingerprint)).toBe(first);
  });
});

describe('resolveAnchor', () => {
  it('returns null for empty or invalid selectors', () => {
    expect(resolveAnchor('')).toBeNull();
    expect(resolveAnchor('   ')).toBeNull();
    expect(resolveAnchor(':not(')).toBeNull();
  });

  it('returns null when the selector matches nothing', () => {
    expect(resolveAnchor('#does-not-exist')).toBeNull();
  });
});

describe('captureDomAnchor', () => {
  it('collapses whitespace, truncates text and never reads input values', () => {
    document.body.innerHTML =
      '<p id="copy">  Hello    world  </p><input id="secret" value="secret" aria-label="Secret">';
    const paragraph = requireElement(document.getElementById('copy'), 'paragraph');
    const input = requireElement(document.getElementById('secret'), 'input');

    expect(captureDomAnchor(paragraph).text).toBe('Hello world');
    expect(captureDomAnchor(input).text).toBe('');
    expect(captureDomAnchor(input).text).not.toContain('secret');

    const long = document.createElement('p');
    long.textContent = 'x'.repeat(200);
    document.body.appendChild(long);

    expect(captureDomAnchor(long).text).toHaveLength(160);
  });

  it('captures explicit roles, implicit roles and accessible names', () => {
    document.body.innerHTML = [
      '<button aria-label="Close dialog">X</button>',
      '<div role="region">Panel</div>',
      '<a href="/docs">Docs</a>',
      '<input type="submit" value="Send">',
      '<img alt="Trend chart" src="chart.png">',
      '<nav>Menu</nav>',
      '<textarea></textarea>',
    ].join('');
    const button = requireElement(document.querySelector('button'), 'button');
    const region = requireElement(document.querySelector('[role="region"]'), 'region');
    const link = requireElement(document.querySelector('a'), 'link');
    const submit = requireElement(document.querySelector('input'), 'submit input');
    const image = requireElement(document.querySelector('img'), 'image');
    const nav = requireElement(document.querySelector('nav'), 'nav');
    const textarea = requireElement(document.querySelector('textarea'), 'textarea');

    expect(captureDomAnchor(button).role).toBe('button');
    expect(captureDomAnchor(button).accessibleName).toBe('Close dialog');
    expect(captureDomAnchor(region).role).toBe('region');
    expect(captureDomAnchor(region).accessibleName).toBeNull();
    expect(captureDomAnchor(link).role).toBe('link');
    expect(captureDomAnchor(submit).role).toBe('button');
    expect(captureDomAnchor(image).role).toBe('img');
    expect(captureDomAnchor(image).accessibleName).toBe('Trend chart');
    expect(captureDomAnchor(nav).role).toBe('navigation');
    expect(captureDomAnchor(textarea).role).toBe('textbox');
  });

  it('captures the bounding box rounded to two decimals and the viewport', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    mockRect(element, { x: 10.125, y: 20, width: 100.5, height: 40.25 });

    const anchor = captureDomAnchor(element);

    expect(anchor.boundingBox).toEqual({ x: 10.13, y: 20, width: 100.5, height: 40.25 });
    expect(anchor.viewport).toEqual({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  });

  it('describes ancestors closest first, without the element itself', () => {
    document.body.innerHTML =
      '<section id="hero" class="banner"><div class="card featured extra"><p id="copy">Text</p></div></section>';
    const paragraph = requireElement(document.getElementById('copy'), 'paragraph');

    const anchor = captureDomAnchor(paragraph);

    expect(anchor.ancestry[0]).toBe('div.card.featured');
    expect(anchor.ancestry[1]).toBe('section#hero');
    expect(anchor.ancestry).not.toContain('p#copy');
    expect(anchor.fingerprint).toBe('#copy');
  });

  it('keeps placeholder records empty until issue #4 fills them', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);

    const anchor = captureDomAnchor(element);

    expect(anchor.attributes).toEqual({});
    expect(anchor.computedStyles).toEqual({});
  });
});
