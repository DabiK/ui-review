import type { Rect, Viewport } from '@core';

/**
 * Everything the content script captures about one page element so a comment can be
 * anchored and re-resolved later. Attribute redaction and computed styles are issue #4;
 * they are exposed here as empty records so callers already have the final shape.
 */
export interface DomAnchorData {
  readonly fingerprint: string;
  readonly ancestry: readonly string[];
  readonly text: string;
  readonly role: string | null;
  readonly accessibleName: string | null;
  readonly attributes: Readonly<Record<string, string>>;
  readonly boundingBox: Rect;
  readonly viewport: Viewport;
  readonly computedStyles: Readonly<Record<string, string>>;
}

const MAX_FINGERPRINT_DEPTH = 6;
const MAX_ANCESTRY_ENTRIES = 6;
const MAX_TEXT_LENGTH = 160;
const MAX_CLASSES_PER_ANCESTOR = 2;

const IMPLICIT_ROLE_BY_TAG: Readonly<Record<string, string>> = {
  button: 'button',
  textarea: 'textbox',
  select: 'combobox',
  img: 'img',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  form: 'form',
};

const HEADING_TAG = /^h[1-6]$/;

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([^A-Za-z0-9_-])/g, '\\$1');
}

function uniqueElementId(element: Element): string | null {
  const id = element.getAttribute('id');
  if (id === null || id === '') {
    return null;
  }
  try {
    if (document.querySelectorAll(`#${escapeSelector(id)}`).length === 1) {
      return id;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * `tag` when the element is the only sibling of its tag, `tag:nth-of-type(n)` otherwise.
 */
function buildSegment(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent === null) {
    return tag;
  }

  const tagName = element.tagName;
  let position = 0;
  let total = 0;
  for (const sibling of parent.children) {
    if (sibling.tagName === tagName) {
      total += 1;
      if (sibling === element) {
        position = total;
      }
    }
  }

  return total <= 1 ? tag : `${tag}:nth-of-type(${position})`;
}

/**
 * Stable, short CSS selector. An element with a unique id is addressed directly,
 * otherwise the path climbs up to a uniquely identified ancestor, `html` or the depth cap.
 * It never throws: whatever could be built is returned.
 */
export function buildFingerprint(element: Element): string {
  const ownId = uniqueElementId(element);
  if (ownId !== null) {
    return `#${escapeSelector(ownId)}`;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null && segments.length < MAX_FINGERPRINT_DEPTH) {
    const ancestorId = uniqueElementId(current);
    if (ancestorId !== null) {
      segments.unshift(`#${escapeSelector(ancestorId)}`);
      break;
    }
    segments.unshift(buildSegment(current));
    if (current.tagName.toLowerCase() === 'html') {
      break;
    }
    current = current.parentElement;
  }

  return segments.length > 0 ? segments.join(' > ') : element.tagName.toLowerCase();
}

export function resolveAnchor(fingerprint: string): Element | null {
  if (fingerprint.trim() === '') {
    return null;
  }
  try {
    return document.querySelector(fingerprint);
  } catch {
    return null;
  }
}

function cleanToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function describeAncestor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = cleanToken(element.getAttribute('id') ?? '');
  if (id !== '') {
    return `${tag}#${id}`;
  }

  const classes = (element.getAttribute('class') ?? '')
    .split(/\s+/)
    .map(cleanToken)
    .filter((token) => token !== '')
    .slice(0, MAX_CLASSES_PER_ANCESTOR);

  return classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;
}

function captureAncestry(element: Element): string[] {
  const ancestry: string[] = [];
  let ancestor = element.parentElement;
  while (ancestor !== null && ancestry.length < MAX_ANCESTRY_ENTRIES) {
    ancestry.push(describeAncestor(ancestor));
    ancestor = ancestor.parentElement;
  }
  return ancestry;
}

function captureText(element: Element): string {
  const collapsed = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, MAX_TEXT_LENGTH);
}

function implicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  if (tag === 'a') {
    return element.hasAttribute('href') ? 'link' : null;
  }
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'reset') {
      return 'button';
    }
    return 'textbox';
  }
  if (HEADING_TAG.test(tag)) {
    return 'heading';
  }

  return IMPLICIT_ROLE_BY_TAG[tag] ?? null;
}

function captureRole(element: Element): string | null {
  const explicit = element.getAttribute('role')?.trim();
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  return implicitRole(element);
}

function captureAccessibleName(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label')?.trim();
  if (ariaLabel !== undefined && ariaLabel !== '') {
    return ariaLabel;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === 'img' || tag === 'area') {
    const alt = element.getAttribute('alt')?.trim();
    if (alt !== undefined && alt !== '') {
      return alt;
    }
  }

  return null;
}

function roundedCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function captureBoundingBox(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return {
    x: roundedCoordinate(box.x),
    y: roundedCoordinate(box.y),
    width: roundedCoordinate(box.width),
    height: roundedCoordinate(box.height),
  };
}

export function captureDomAnchor(element: Element): DomAnchorData {
  return {
    fingerprint: buildFingerprint(element),
    ancestry: captureAncestry(element),
    text: captureText(element),
    role: captureRole(element),
    accessibleName: captureAccessibleName(element),
    attributes: {},
    boundingBox: captureBoundingBox(element),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    computedStyles: {},
  };
}
