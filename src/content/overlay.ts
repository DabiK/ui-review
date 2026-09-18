import type { CommentCategory, CommentPriority } from '@core';
import { captureDomAnchor, resolveAnchor } from './dom-anchor';
import type { DomAnchorData } from './dom-anchor';

export interface OverlayPin {
  readonly id: string;
  readonly index: number;
  readonly fingerprint: string;
}

export interface OverlayDraft {
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly anchor: DomAnchorData;
}

export type OverlaySaveResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface ReviewOverlayOptions {
  readonly onCreateComment: (draft: OverlayDraft) => Promise<OverlaySaveResult>;
  readonly onStopReview: () => void;
}

export interface ReviewOverlayHandle {
  readonly host: HTMLElement;
  setPins(pins: readonly OverlayPin[]): void;
  unmount(): void;
}

const CATEGORY_OPTIONS: readonly CommentCategory[] = [
  'UI',
  'UX',
  'Content',
  'Accessibility',
  'Performance',
  'Bug',
  'Other',
];

const PRIORITY_OPTIONS: readonly CommentPriority[] = ['critical', 'important', 'minor'];

const PRIORITY_LABELS: Readonly<Record<CommentPriority, string>> = {
  critical: 'Critical',
  important: 'Important',
  minor: 'Minor',
};

const DEFAULT_CATEGORY: CommentCategory = 'UI';
const DEFAULT_PRIORITY: CommentPriority = 'important';

const HOST_ID = 'ui-review-overlay-host';
const VIEWPORT_MARGIN = 8;
const COMPOSER_FALLBACK_WIDTH = 320;
const COMPOSER_FALLBACK_HEIGHT = 240;

const NON_PINNABLE_TAGS: ReadonlySet<string> = new Set([
  'html',
  'body',
  'script',
  'style',
  'link',
  'meta',
]);

const OVERLAY_STYLES = `
:host {
  all: initial;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

.ui-review-highlight {
  background: rgba(34, 62, 92, 0.08);
  border: 1px solid #6e2130;
  border-radius: 2px;
  pointer-events: none;
  position: fixed;
}

.ui-review-pins {
  inset: 0;
  pointer-events: none;
  position: fixed;
}

.ui-review-pin {
  background: #6e2130;
  border-radius: 2px;
  color: #f6f1e7;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  line-height: 18px;
  min-width: 18px;
  padding: 0 4px;
  pointer-events: none;
  position: fixed;
  text-align: center;
}

.ui-review-badge {
  align-items: center;
  background: #f6f1e7;
  border: 1px solid #1f1d1a;
  border-radius: 2px;
  bottom: 16px;
  color: #1f1d1a;
  display: flex;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  gap: 10px;
  padding: 8px 10px;
  pointer-events: none;
  position: fixed;
  right: 16px;
}

.ui-review-badge__title {
  color: #6e2130;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ui-review-badge__hint {
  color: #8a8175;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
}

.ui-review-button {
  appearance: none;
  background: transparent;
  border: 1px solid #223e5c;
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
}

.ui-review-button:focus-visible {
  outline: 2px solid #6e2130;
  outline-offset: 2px;
}

.ui-review-button--primary {
  background: #223e5c;
  color: #ffffff;
}

.ui-review-button--primary:hover {
  background: #1b3249;
  border-color: #1b3249;
}

.ui-review-button--primary:disabled {
  cursor: progress;
  opacity: 0.6;
}

.ui-review-button--ghost {
  border-color: #d8cfc0;
  color: #1f1d1a;
  pointer-events: auto;
}

.ui-review-button--ghost:hover {
  background: #efe7d8;
}

.ui-review-composer {
  background: #f6f1e7;
  border: 1px solid #1f1d1a;
  border-radius: 2px;
  color: #1f1d1a;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  gap: 10px;
  max-width: calc(100vw - 16px);
  padding: 14px;
  pointer-events: auto;
  position: fixed;
  width: 320px;
}

.ui-review-composer__title {
  color: #6e2130;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  margin: 0;
  text-transform: uppercase;
}

.ui-review-textarea {
  background: #fffdf8;
  border: 1px solid #d8cfc0;
  border-radius: 2px;
  color: #1f1d1a;
  font-family: inherit;
  font-size: 13px;
  min-height: 84px;
  padding: 8px;
  resize: vertical;
  width: 100%;
}

.ui-review-textarea:focus-visible,
.ui-review-select:focus-visible {
  outline: 2px solid #6e2130;
  outline-offset: 1px;
}

.ui-review-textarea[aria-invalid='true'] {
  border-color: #6e2130;
}

.ui-review-fields {
  display: flex;
  gap: 10px;
}

.ui-review-field {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 4px;
}

.ui-review-field__label {
  color: #8a8175;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ui-review-select {
  background: #fffdf8;
  border: 1px solid #d8cfc0;
  border-radius: 2px;
  color: #1f1d1a;
  font-family: inherit;
  font-size: 12px;
  padding: 6px;
  width: 100%;
}

.ui-review-composer__error {
  color: #6e2130;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  margin: 0;
}

.ui-review-composer__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
`;

interface PinView {
  readonly element: Element;
  readonly node: HTMLDivElement;
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Mounts the isolated click-to-pin overlay. Nothing touches the DOM until this is called,
 * and every listener is removed by `unmount()`, which is safe to call more than once.
 */
export function mountReviewOverlay(options: ReviewOverlayOptions): ReviewOverlayHandle {
  const doc = document;
  const win = window;

  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.display = 'block';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  (doc.documentElement ?? doc.body).appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = OVERLAY_STYLES;
  shadow.appendChild(style);

  const highlight = doc.createElement('div');
  highlight.className = 'ui-review-highlight';
  highlight.dataset['uiReview'] = 'highlight';
  highlight.hidden = true;

  const pinsLayer = doc.createElement('div');
  pinsLayer.className = 'ui-review-pins';
  pinsLayer.dataset['uiReview'] = 'pins';

  const composer = doc.createElement('section');
  composer.className = 'ui-review-composer';
  composer.dataset['uiReview'] = 'composer';
  composer.setAttribute('role', 'group');
  composer.setAttribute('aria-label', 'Add a note');
  composer.hidden = true;

  const composerTitle = doc.createElement('h2');
  composerTitle.className = 'ui-review-composer__title';
  composerTitle.textContent = 'ADD A NOTE';

  const textarea = doc.createElement('textarea');
  textarea.className = 'ui-review-textarea';
  textarea.setAttribute('aria-label', 'Review note');
  textarea.rows = 4;
  textarea.placeholder = 'Describe the issue';

  const errorMessage = doc.createElement('p');
  errorMessage.className = 'ui-review-composer__error';
  errorMessage.dataset['uiReview'] = 'error';
  errorMessage.setAttribute('role', 'alert');
  errorMessage.hidden = true;

  const fields = doc.createElement('div');
  fields.className = 'ui-review-fields';

  const categorySelect = createSelect(
    CATEGORY_OPTIONS.map((category) => ({ value: category, label: category })),
    DEFAULT_CATEGORY,
  );
  categorySelect.dataset['uiReview'] = 'category';
  fields.appendChild(createField('Category', categorySelect));

  const prioritySelect = createSelect(
    PRIORITY_OPTIONS.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] })),
    DEFAULT_PRIORITY,
  );
  prioritySelect.dataset['uiReview'] = 'priority';
  fields.appendChild(createField('Priority', prioritySelect));

  const actions = doc.createElement('div');
  actions.className = 'ui-review-composer__actions';

  const saveButton = doc.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'ui-review-button ui-review-button--primary';
  saveButton.dataset['uiReview'] = 'save';
  saveButton.textContent = 'Save note';

  const cancelButton = doc.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'ui-review-button ui-review-button--ghost';
  cancelButton.dataset['uiReview'] = 'cancel';
  cancelButton.textContent = 'Cancel';

  actions.append(saveButton, cancelButton);
  composer.append(composerTitle, textarea, errorMessage, fields, actions);

  const badge = doc.createElement('div');
  badge.className = 'ui-review-badge';
  badge.dataset['uiReview'] = 'badge';

  const badgeTitle = doc.createElement('span');
  badgeTitle.className = 'ui-review-badge__title';
  badgeTitle.textContent = 'Review mode';

  const badgeHint = doc.createElement('span');
  badgeHint.className = 'ui-review-badge__hint';
  badgeHint.textContent = 'Shift+Escape to stop';

  const exitButton = doc.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'ui-review-button ui-review-button--ghost';
  exitButton.dataset['uiReview'] = 'exit';
  exitButton.textContent = 'Exit review mode';

  badge.append(badgeTitle, badgeHint, exitButton);
  shadow.append(highlight, pinsLayer, composer, badge);

  let composerTarget: Element | null = null;
  let hoveredElement: Element | null = null;
  let saving = false;
  let pinViews: PinView[] = [];
  let frameId: number | null = null;
  let unmounted = false;

  function setChromeHidden(hidden: boolean): void {
    host.style.visibility = hidden ? 'hidden' : '';
  }

  /** Resolves after the browser had a chance to paint; falls through when rAF is absent. */
  function nextPaint(): Promise<void> {
    if (typeof win.requestAnimationFrame !== 'function') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => resolve());
      });
    });
  }

  function createSelect(entries: readonly SelectOption[], selected: string): HTMLSelectElement {
    const select = doc.createElement('select');
    select.className = 'ui-review-select';
    for (const entry of entries) {
      const option = doc.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    }
    select.value = selected;
    return select;
  }

  function createField(labelText: string, control: HTMLSelectElement): HTMLLabelElement {
    const label = doc.createElement('label');
    label.className = 'ui-review-field';
    const caption = doc.createElement('span');
    caption.className = 'ui-review-field__label';
    caption.textContent = labelText;
    label.append(caption, control);
    return label;
  }

  function isOverlayEvent(event: Event): boolean {
    if (event.composedPath().includes(host)) {
      return true;
    }
    const target = event.target;
    return target instanceof Node && target.getRootNode() === shadow;
  }

  function isPinnable(target: Element): boolean {
    return !NON_PINNABLE_TAGS.has(target.tagName.toLowerCase());
  }

  function showHighlight(element: Element): void {
    const box = element.getBoundingClientRect();
    highlight.style.left = `${box.left}px`;
    highlight.style.top = `${box.top}px`;
    highlight.style.width = `${Math.max(0, box.width)}px`;
    highlight.style.height = `${Math.max(0, box.height)}px`;
    highlight.hidden = false;
  }

  function hideHighlight(): void {
    highlight.hidden = true;
  }

  function showError(message: string): void {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    textarea.setAttribute('aria-invalid', 'true');
  }

  function clearError(): void {
    errorMessage.textContent = '';
    errorMessage.hidden = true;
    textarea.removeAttribute('aria-invalid');
  }

  function readCategory(): CommentCategory {
    return CATEGORY_OPTIONS.find((category) => category === categorySelect.value) ?? DEFAULT_CATEGORY;
  }

  function readPriority(): CommentPriority {
    return PRIORITY_OPTIONS.find((priority) => priority === prioritySelect.value) ?? DEFAULT_PRIORITY;
  }

  function positionComposer(): void {
    if (composerTarget === null) {
      return;
    }

    const targetBox = composerTarget.getBoundingClientRect();
    const composerBox = composer.getBoundingClientRect();
    const width =
      composerBox.width > 0
        ? composerBox.width
        : Math.min(COMPOSER_FALLBACK_WIDTH, Math.max(0, win.innerWidth - VIEWPORT_MARGIN * 2));
    const height = composerBox.height > 0 ? composerBox.height : COMPOSER_FALLBACK_HEIGHT;

    const left = clamp(
      targetBox.left,
      VIEWPORT_MARGIN,
      win.innerWidth - width - VIEWPORT_MARGIN,
    );
    const below = targetBox.bottom + VIEWPORT_MARGIN;
    const preferredTop =
      below + height <= win.innerHeight - VIEWPORT_MARGIN
        ? below
        : targetBox.top - height - VIEWPORT_MARGIN;
    const top = clamp(preferredTop, VIEWPORT_MARGIN, win.innerHeight - height - VIEWPORT_MARGIN);

    composer.style.left = `${Math.round(left)}px`;
    composer.style.top = `${Math.round(top)}px`;
  }

  function positionPin(view: PinView): void {
    if (!view.element.isConnected) {
      view.node.hidden = true;
      return;
    }
    const box = view.element.getBoundingClientRect();
    view.node.hidden = false;
    view.node.style.left = `${Math.round(box.left)}px`;
    view.node.style.top = `${Math.round(box.top)}px`;
  }

  function repositionAll(): void {
    if (hoveredElement !== null) {
      showHighlight(hoveredElement);
    }
    if (composerTarget !== null) {
      positionComposer();
    }
    for (const view of pinViews) {
      positionPin(view);
    }
  }

  function scheduleReposition(): void {
    if (frameId !== null) {
      return;
    }
    frameId = win.requestAnimationFrame(() => {
      frameId = null;
      repositionAll();
    });
  }

  function openComposer(element: Element): void {
    composerTarget = element;
    hoveredElement = element;
    textarea.value = '';
    categorySelect.value = DEFAULT_CATEGORY;
    prioritySelect.value = DEFAULT_PRIORITY;
    saveButton.disabled = false;
    saveButton.textContent = 'Save note';
    clearError();
    showHighlight(element);
    composer.hidden = false;
    positionComposer();
    textarea.focus();
  }

  function closeComposer(): void {
    composerTarget = null;
    hoveredElement = null;
    saving = false;
    composer.hidden = true;
    textarea.value = '';
    categorySelect.value = DEFAULT_CATEGORY;
    prioritySelect.value = DEFAULT_PRIORITY;
    saveButton.disabled = false;
    saveButton.textContent = 'Save note';
    clearError();
    hideHighlight();
  }

  async function saveComposer(): Promise<void> {
    if (composerTarget === null || saving) {
      return;
    }

    const target = composerTarget;
    const text = textarea.value.trim();
    if (text === '') {
      showError('Write a note before saving.');
      textarea.focus();
      return;
    }

    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';

    const draft: OverlayDraft = {
      text,
      category: readCategory(),
      priority: readPriority(),
      anchor: captureDomAnchor(target),
    };

    // The screenshots must show the page, not the review chrome: hide the overlay and let
    // the browser paint once before the capture runs on the extension side.
    setChromeHidden(true);
    await nextPaint();

    let result: OverlaySaveResult;
    try {
      result = await options.onCreateComment(draft);
    } catch {
      result = { ok: false, message: 'The note could not be saved.' };
    } finally {
      setChromeHidden(false);
    }

    if (composerTarget !== target) {
      return;
    }

    saving = false;
    saveButton.disabled = false;
    saveButton.textContent = 'Save note';

    if (result.ok) {
      closeComposer();
      return;
    }
    showError(result.message);
  }

  function onMouseMove(event: MouseEvent): void {
    if (composerTarget !== null) {
      return;
    }
    if (isOverlayEvent(event)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || target === doc.documentElement || target === doc.body) {
      hoveredElement = null;
      hideHighlight();
      return;
    }

    hoveredElement = target;
    showHighlight(target);
  }

  function onClick(event: MouseEvent): void {
    if (composerTarget !== null) {
      return;
    }
    if (isOverlayEvent(event)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || !isPinnable(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openComposer(target);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        closeComposer();
        options.onStopReview();
        return;
      }
      if (composerTarget !== null) {
        event.preventDefault();
        event.stopPropagation();
        closeComposer();
      }
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && composerTarget !== null) {
      event.preventDefault();
      event.stopPropagation();
      void saveComposer();
    }
  }

  function onViewportChange(): void {
    scheduleReposition();
  }

  function onExitClick(): void {
    options.onStopReview();
  }

  function onSaveClick(): void {
    void saveComposer();
  }

  function onCancelClick(): void {
    closeComposer();
  }

  function setPins(pins: readonly OverlayPin[]): void {
    for (const view of pinViews) {
      view.node.remove();
    }
    pinViews = [];

    if (unmounted) {
      return;
    }

    for (const pin of pins) {
      const element = resolveAnchor(pin.fingerprint);
      if (element === null) {
        continue;
      }

      const node = doc.createElement('div');
      node.className = 'ui-review-pin';
      node.dataset['uiReview'] = 'pin';
      node.textContent = String(pin.index).padStart(2, '0');
      pinsLayer.appendChild(node);

      const view: PinView = { element, node };
      pinViews.push(view);
      positionPin(view);
    }
  }

  function unmount(): void {
    if (unmounted) {
      return;
    }
    unmounted = true;

    doc.removeEventListener('mousemove', onMouseMove, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('scroll', onViewportChange, true);
    win.removeEventListener('resize', onViewportChange);

    if (frameId !== null) {
      win.cancelAnimationFrame(frameId);
      frameId = null;
    }

    for (const view of pinViews) {
      view.node.remove();
    }
    pinViews = [];
    composerTarget = null;
    hoveredElement = null;
    host.remove();
  }

  textarea.addEventListener('input', clearError);
  saveButton.addEventListener('click', onSaveClick);
  cancelButton.addEventListener('click', onCancelClick);
  exitButton.addEventListener('click', onExitClick);

  doc.addEventListener('mousemove', onMouseMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('scroll', onViewportChange, true);
  win.addEventListener('resize', onViewportChange);

  return { host, setPins, unmount };
}
