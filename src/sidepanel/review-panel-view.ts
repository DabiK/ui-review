import { COMMENT_CATEGORIES, COMMENT_PRIORITIES, isReviewablePageUrl } from '@core';
import type {
  AttachmentKind,
  AttachmentSummary,
  BridgeSetup,
  CommentCategory,
  CommentPriority,
  CommentSummary,
  FrameworkEvidenceSummary,
  ReviewPanelState,
  SessionSummary,
  SourceMapEvidenceSummary,
  VisualEvidenceSummary,
} from '@core';

export interface SaveCommentInput {
  readonly commentId: string;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
}

export interface ReviewPanelViewOptions {
  readonly pendingClearSessionId?: string | null;
  readonly editingCommentId?: string | null;
  readonly pendingDeleteCommentId?: string | null;
  readonly pendingDeleteAttachmentId?: string | null;
  readonly notice?: string | null;
  /** Local bridge setup; `undefined` hides the block, `null` means it is being checked. */
  readonly bridgeSetup?: BridgeSetup | null;
  readonly onCheckBridge?: () => void;
  readonly onRefresh?: () => void;
  readonly onStartReview?: () => void;
  readonly onStopReview?: (sessionId: string) => void;
  readonly onSetReviewPaused?: (sessionId: string, paused: boolean) => void;
  readonly pausePending?: boolean;
  readonly onRenameSession?: (sessionId: string, name: string) => void;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onRequestClearSession?: (sessionId: string) => void;
  readonly onConfirmClearSession?: (sessionId: string) => void;
  readonly onCancelClearSession?: () => void;
  readonly onEditComment?: (commentId: string) => void;
  readonly onSaveComment?: (input: SaveCommentInput) => void;
  readonly onCancelEditComment?: () => void;
  readonly onRequestDeleteComment?: (commentId: string) => void;
  readonly onConfirmDeleteComment?: (commentId: string) => void;
  readonly onCancelDeleteComment?: () => void;
  readonly onRequestDeleteAttachment?: (attachmentId: string) => void;
  readonly onConfirmDeleteAttachment?: (commentId: string, attachmentId: string) => void;
  readonly onCancelDeleteAttachment?: () => void;
  readonly onExportHandoff?: (sessionId: string) => void;
}

const PRIORITY_BADGES: Readonly<Record<CommentPriority, string>> = {
  critical: 'P1',
  important: 'P2',
  minor: 'P3',
};

const PRIORITY_LABELS: Readonly<Record<CommentPriority, string>> = {
  critical: 'Critical',
  important: 'Important',
  minor: 'Minor',
};

const FRAMEWORK_LABELS: Readonly<Record<FrameworkEvidenceSummary['framework'], string>> = {
  react: 'React',
  vue: 'Vue',
  unknown: 'Framework',
};

/** Plate legends from the design direction: « Fig. 1 · Viewport », « Fig. 2 · Element crop ». */
const ATTACHMENT_CAPTIONS: Readonly<Record<AttachmentKind, string>> = {
  'viewport-screenshot': 'Fig. 1 · Viewport',
  'element-crop': 'Fig. 2 · Element crop',
};

const ATTACHMENT_LABELS: Readonly<Record<AttachmentKind, string>> = {
  'viewport-screenshot': 'viewport screenshot',
  'element-crop': 'element crop',
};

const ATTACHMENT_ALT: Readonly<Record<AttachmentKind, string>> = {
  'viewport-screenshot': 'Viewport screenshot',
  'element-crop': 'Element crop',
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(label: string, className: string, onClick?: () => void): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  if (onClick !== undefined) {
    node.addEventListener('click', onClick);
  }
  return node;
}

function sectionHeader(index: string, id: string, label: string): HTMLElement {
  const title = element('h2', 'section__title');
  title.id = id;
  title.append(element('span', 'section__index', index), document.createTextNode(label));
  return title;
}

function ledgerRow(term: string, value: string): [HTMLElement, HTMLElement] {
  return [element('dt', 'ledger__term', term), element('dd', 'ledger__value', value)];
}

function statusBadge(status: SessionSummary['status'], paused = false): HTMLElement {
  const label = status === 'active' ? (paused ? 'Review paused' : 'Review in progress') : 'Review stopped';
  return element('p', `status-badge status-badge--${paused && status === 'active' ? 'paused' : status}`, label);
}

function savedPageLink(session: SessionSummary): HTMLElement {
  if (!isReviewablePageUrl(session.pageUrl)) return element('p', 'saved-page-link', 'Saved page URL unavailable');
  const link = element('a', 'saved-page-link', session.pageUrl);
  link.href = session.pageUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open saved page in a new tab: ${session.pageUrl}`);
  return link;
}

function pauseButton(session: SessionSummary, options: ReviewPanelViewOptions): HTMLButtonElement {
  const paused = session.annotationPaused === true;
  const control = button(paused ? 'Resume review' : 'Pause review', paused ? 'action' : 'action action--ghost', () => options.onSetReviewPaused?.(session.id, !paused));
  control.disabled = options.pausePending === true;
  control.dataset['focusId'] = `pause-${session.id}`;
  return control;
}

/** Local-time rendering for humans; storage keeps the canonical UTC ISO timestamp. */
function formatDisplayTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function selectOption(value: string, label: string, selected: boolean): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  return option;
}

function renderMasthead(title: string, meta: string): HTMLElement {
  const masthead = element('header', 'masthead');
  masthead.append(
    element('p', 'masthead__kicker', 'Page notes / Agent brief'),
    element('h1', 'masthead__title', title),
    element('p', 'masthead__meta', 'Saved on this device'),
  );
  masthead.title = meta;
  return masthead;
}

function renderFooter(options: ReviewPanelViewOptions): HTMLElement {
  const footer = element('footer', 'footer');
  const actions = element('div', 'actions');
  actions.append(button('Refresh', 'action action--ghost', options.onRefresh));
  footer.append(
    actions,
    element(
      'p',
      'footnote',
      'Stored in this browser. Nothing is uploaded.',
    ),
  );
  return footer;
}

function renderNotice(message: string): HTMLElement {
  const notice = element('p', 'notice', message);
  notice.setAttribute('role', 'alert');
  return notice;
}

function renderCurrentPageSection(
  state: ReviewPanelState,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('section', 'section page-context');
  section.setAttribute('aria-label', 'Current page');

  const page = state.activePage;
  if (page === null) {
    section.append(
      element('p', 'empty', 'No active browser tab found. Focus a tab, then refresh.'),
    );
    return section;
  }

  if (page.title.trim().length > 0) {
    section.append(element('p', 'page-title', page.title));
  }
  section.append(
    element('p', 'page-host', page.hostname.length > 0 ? page.hostname : 'Restricted page'),
  );
  section.title = page.url;

  const actions = element('div', 'actions');
  if (!page.eligible) {
    section.append(
      element('p', 'empty', 'This page cannot be reviewed: only http(s) pages are supported.'),
    );
    const disabled = button('Start review', 'action');
    disabled.disabled = true;
    actions.append(disabled);
    section.append(actions);
    return section;
  }

  const current = state.currentSession;
  if (current !== null && current.status === 'active') {
    section.classList.add('page-context--active');
    section.append(statusBadge('active', current.annotationPaused));
    actions.append(pauseButton(current, options));
    section.append(element('p', 'page-hint', current.annotationPaused
      ? 'Browse freely. Resume here when you are ready to annotate.'
      : 'Click an element to add a note. Pause to navigate the page.'));
  } else {
    if (current !== null) {
      section.append(statusBadge('stopped'));
    }
    actions.append(button('Start review', 'action', options.onStartReview));
  }
  section.append(actions);

  return section;
}

function renderRenameForm(
  session: SessionSummary,
  options: ReviewPanelViewOptions,
): HTMLFormElement {
  const form = element('form', 'field');
  form.noValidate = true;
  const label = element('label', 'field__label', 'Session name');
  label.htmlFor = 'session-name-input';

  const input = element('input', 'field__input');
  input.id = 'session-name-input';
  input.name = 'name';
  input.type = 'text';
  input.value = session.name;
  input.defaultValue = session.name;
  input.required = true;
  input.autocomplete = 'off';

  const submit = element('button', 'action', 'Rename');
  submit.type = 'submit';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    form.querySelector('.field__error')?.remove();

    const name = input.value.trim();
    if (name.length === 0) {
      input.setAttribute('aria-invalid', 'true');
      form.append(element('p', 'field__error', 'Session name must not be blank.'));
      input.focus();
      return;
    }

    input.removeAttribute('aria-invalid');
    options.onRenameSession?.(session.id, name);
  });

  form.append(label, input, submit);
  return form;
}

function renderClearConfirmation(
  session: SessionSummary,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const confirm = element('section', 'confirm');
  confirm.setAttribute('aria-label', 'Confirm session deletion');
  confirm.append(
    element(
      'p',
      'confirm__question',
      `Delete “${session.name}” and its ${session.commentCount} ${
        session.commentCount === 1 ? 'note' : 'notes'
      }? This cannot be undone.`,
    ),
  );

  const actions = element('div', 'actions');
  const deleteButton = button('Delete session permanently', 'action action--danger', () =>
    options.onConfirmClearSession?.(session.id),
  );
  deleteButton.setAttribute('data-autofocus', 'true');
  actions.append(deleteButton, button('Keep session', 'action action--ghost', options.onCancelClearSession));
  confirm.append(actions);

  return confirm;
}

/**
 * Local bridge setup — issue #10. A ready bridge is a quiet line; a missing or mismatched
 * bridge becomes an actionable setup state (what to install, then "Check again") instead of
 * a raw transport error.
 */
function renderBridgeBlock(
  setup: BridgeSetup | null,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const block = element('div', 'bridge');
  block.append(element('p', 'bridge__label', 'Local bridge'));

  if (setup === null) {
    block.append(element('p', 'bridge__status', 'Checking…'));
    return block;
  }

  if (setup.kind === 'ready') {
    block.append(
      element('p', 'bridge__status', `Ready — v${setup.bridgeVersion} · ${setup.platform}`),
    );
    return block;
  }

  const attention = setup.kind === 'missing' ? 'Not installed.' : 'Not compatible.';
  block.append(
    element('p', 'bridge__status bridge__status--attention', attention),
    element(
      'p',
      'footnote',
      `${setup.message} Install the matching bridge build for this platform, then check again.`,
    ),
  );

  const actions = element('div', 'actions');
  actions.append(button('Check again', 'action action--ghost', options.onCheckBridge));
  block.append(actions);
  return block;
}

/**
 * One-action agent handoff: materialize the brief and copy it. The temporary-directory
 * behavior is explained inline, and the action is disabled while there is nothing to hand
 * off or while the local bridge is known to be missing or incompatible.
 */
function renderHandoffBlock(
  session: SessionSummary,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const block = element('div', 'handoff');
  block.append(element('p', 'handoff__label', `${session.commentCount} ${session.commentCount === 1 ? 'note' : 'notes'} · Agent handoff`));

  if (options.bridgeSetup !== undefined) {
    block.append(renderBridgeBlock(options.bridgeSetup, options));
  }

  const actions = element('div', 'actions');
  const copy = button('Copy agent brief', 'action', () => options.onExportHandoff?.(session.id));
  actions.append(copy);

  if (session.commentCount === 0) {
    copy.disabled = true;
    block.append(
      actions,
      element('p', 'footnote', 'Add at least one note before copying an agent brief.'),
    );
    return block;
  }

  if (options.bridgeSetup !== undefined && options.bridgeSetup !== null &&
    options.bridgeSetup.kind !== 'ready') {
    copy.disabled = true;
    block.append(
      actions,
      element(
        'p',
        'footnote',
        'The agent brief needs the local bridge. Install it, then choose Check again.',
      ),
    );
    return block;
  }

  block.append(
    actions,
    element(
      'p',
      'footnote',
      'Paste into your coding agent. Includes notes, context and screenshots in a temporary local folder.',
    ),
  );
  return block;
}

function renderSessionSection(
  session: SessionSummary | null,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('details', 'section session-settings');
  section.id = 'session-settings';
  section.append(element('summary', 'disclosure-title', 'Session settings'));
  section.open = options.pendingClearSessionId === session?.id;

  if (session === null) {
    section.append(
      element('p', 'empty', 'No session selected. Start a review on an eligible page.'),
    );
    return section;
  }

  section.append(renderRenameForm(session, options), statusBadge(session.status, session.annotationPaused));
  if (session.status === 'active') {
    section.append(button('Stop review', 'action action--ghost', () => options.onStopReview?.(session.id)));
  }

  const ledger = element('dl', 'ledger');
  ledger.append(
    ...ledgerRow('Started', formatDisplayTime(session.startedAt)),
    ...ledgerRow(
      'Stopped',
      session.stoppedAt === null ? '—' : formatDisplayTime(session.stoppedAt),
    ),
    ...ledgerRow('Notes', String(session.commentCount)),
  );
  section.append(ledger);

  if (options.pendingClearSessionId === session.id) {
    section.append(renderClearConfirmation(session, options));
  } else {
    const actions = element('div', 'actions');
    actions.append(
      button('Clear session', 'action action--ghost', () =>
        options.onRequestClearSession?.(session.id),
      ),
    );
    section.append(actions);
  }

  return section;
}

function readSelectedValue<T extends string>(
  select: HTMLSelectElement,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((value) => value === select.value) ?? fallback;
}

function renderCommentForm(
  comment: CommentSummary,
  options: ReviewPanelViewOptions,
): HTMLFormElement {
  const form = element('form', 'comment-form');
  form.noValidate = true;
  const label = element('label', 'field__label', 'Note text');
  label.htmlFor = 'comment-text-input';

  const textarea = element('textarea', 'field__input field__input--multiline');
  textarea.id = 'comment-text-input';
  textarea.name = 'text';
  textarea.rows = 4;
  textarea.value = comment.text;
  textarea.required = true;

  const categorySelect = element('select', 'field__input');
  categorySelect.id = 'comment-category-select';
  categorySelect.name = 'category';
  categorySelect.append(
    ...COMMENT_CATEGORIES.map((category) =>
      selectOption(category, category, category === comment.category),
    ),
  );
  const categoryField = element('div', 'field field--inline');
  const categoryLabel = element('label', 'field__label', 'Category');
  categoryLabel.htmlFor = categorySelect.id;
  categoryField.append(categoryLabel, categorySelect);

  const prioritySelect = element('select', 'field__input');
  prioritySelect.id = 'comment-priority-select';
  prioritySelect.name = 'priority';
  prioritySelect.append(
    ...COMMENT_PRIORITIES.map((priority) =>
      selectOption(priority, PRIORITY_LABELS[priority], priority === comment.priority),
    ),
  );
  const priorityField = element('div', 'field field--inline');
  const priorityLabel = element('label', 'field__label', 'Priority');
  priorityLabel.htmlFor = prioritySelect.id;
  priorityField.append(priorityLabel, prioritySelect);

  const fields = element('div', 'field-row');
  fields.append(categoryField, priorityField);

  const actions = element('div', 'actions');
  const save = element('button', 'action', 'Save note');
  save.type = 'submit';
  actions.append(save, button('Cancel', 'action action--ghost', options.onCancelEditComment));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    form.querySelector('.field__error')?.remove();

    const text = textarea.value.trim();
    if (text.length === 0) {
      textarea.setAttribute('aria-invalid', 'true');
      form.append(element('p', 'field__error', 'Write a note before saving.'));
      textarea.focus();
      return;
    }

    textarea.removeAttribute('aria-invalid');
    options.onSaveComment?.({
      commentId: comment.id,
      text,
      category: readSelectedValue(categorySelect, COMMENT_CATEGORIES, comment.category),
      priority: readSelectedValue(prioritySelect, COMMENT_PRIORITIES, comment.priority),
    });
  });

  form.append(label, textarea, fields, actions);
  return form;
}

function renderCommentDeleteConfirmation(
  comment: CommentSummary,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const confirm = element('div', 'confirm confirm--inline');
  confirm.setAttribute('aria-label', 'Confirm note deletion');
  confirm.append(
    element(
      'p',
      'confirm__question',
      `Delete the note “${comment.text.slice(0, 48)}${
        comment.text.length > 48 ? '…' : ''
      }”? This cannot be undone.`,
    ),
  );

  const actions = element('div', 'actions');
  const deleteButton = button('Delete note permanently', 'action action--danger', () =>
    options.onConfirmDeleteComment?.(comment.id),
  );
  deleteButton.setAttribute('data-autofocus', 'true');
  actions.append(deleteButton, button('Keep note', 'action action--ghost', options.onCancelDeleteComment));

  confirm.append(actions);
  return confirm;
}

function renderAttachmentDeleteConfirmation(
  comment: CommentSummary,
  attachment: AttachmentSummary,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const confirm = element('div', 'confirm confirm--inline');
  confirm.setAttribute('aria-label', 'Confirm screenshot deletion');
  confirm.append(
    element(
      'p',
      'confirm__question',
      `Delete the ${ATTACHMENT_LABELS[attachment.kind]}? This cannot be undone.`,
    ),
  );

  const actions = element('div', 'actions');
  const deleteButton = button('Delete screenshot permanently', 'action action--danger', () =>
    options.onConfirmDeleteAttachment?.(comment.id, attachment.id),
  );
  deleteButton.setAttribute('data-autofocus', 'true');
  actions.append(
    deleteButton,
    button('Keep screenshot', 'action action--ghost', options.onCancelDeleteAttachment),
  );
  confirm.append(actions);
  return confirm;
}

function renderAttachmentFigure(
  comment: CommentSummary,
  attachment: AttachmentSummary,
  notePosition: number,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const figure = element('figure', 'figure');
  figure.dataset['attachmentId'] = attachment.id;
  figure.dataset['attachmentKind'] = attachment.kind;

  if (attachment.dataUrl !== null) {
    const image = document.createElement('img');
    image.className = 'figure__image';
    image.src = attachment.dataUrl;
    image.alt = `${ATTACHMENT_ALT[attachment.kind]} for note ${String(notePosition).padStart(2, '0')}`;
    image.loading = 'lazy';
    image.width = attachment.width;
    image.height = attachment.height;
    figure.append(image);
  } else {
    figure.append(
      element('p', 'figure__artifact', 'Artifact stored outside the browser profile.'),
    );
  }

  figure.append(element('figcaption', 'figure__caption', ATTACHMENT_CAPTIONS[attachment.kind]));

  if (options.pendingDeleteAttachmentId === attachment.id) {
    figure.append(renderAttachmentDeleteConfirmation(comment, attachment, options));
  } else {
    const actions = element('div', 'figure__actions');
    actions.append(
      button(`Remove ${ATTACHMENT_LABELS[attachment.kind]}`, 'action action--ghost', () =>
        options.onRequestDeleteAttachment?.(attachment.id),
      ),
    );
    figure.append(actions);
  }

  return figure;
}

/** Honest capture status; `null` means both screenshots exist. */
function captureStatusMessage(visual: VisualEvidenceSummary): string | null {
  const reason = visual.reason ?? 'The screenshot could not be captured.';
  const viewportFailed = visual.viewport === 'failed';
  const cropFailed = visual.elementCrop === 'failed';

  if (viewportFailed && cropFailed) {
    return `Screenshots unavailable — ${reason}`;
  }
  if (viewportFailed) {
    return `Viewport screenshot unavailable — ${reason}`;
  }
  if (cropFailed) {
    return `Element crop unavailable — ${reason}`;
  }
  return null;
}

/**
 * Framework context is best effort and says so: `confirmed` renders as `detected`,
 * `inferred` is always labelled, and a missing context is stated instead of hidden.
 */
function frameworkStatusMessage(framework: FrameworkEvidenceSummary): string {
  const label = FRAMEWORK_LABELS[framework.framework];

  if (framework.confidence === 'unavailable') {
    return `${label} context: unavailable`;
  }
  if (framework.confidence === 'confirmed') {
    return framework.componentName === null
      ? `${label} context: detected`
      : `${label} context: detected — ${framework.componentName}`;
  }
  return framework.componentName === null
    ? `${label} context: inferred (best effort)`
    : `${label} context: inferred — ${framework.componentName} (best effort)`;
}

/**
 * Source context is honest about how it was obtained: a direct development reference is
 * `detected`, a position resolved from a bundle source map stays `inferred`, and an
 * unavailable resolution is stated instead of hidden.
 */
function sourceMapStatusMessage(sourceMap: SourceMapEvidenceSummary): string {
  if (sourceMap.confidence === 'unavailable') {
    return 'Source map: unavailable';
  }

  const file = sourceMap.sourceFile ?? 'unknown source';
  const location = `${file}:${sourceMap.line ?? 1}:${sourceMap.column ?? 1}`;
  return sourceMap.confidence === 'confirmed'
    ? `Source map: detected — ${location}`
    : `Source map: inferred — ${location} (best effort)`;
}

function renderCommentRow(
  comment: CommentSummary,
  position: number,
  options: ReviewPanelViewOptions,
): HTMLLIElement {
  const item = element('li', 'comment');
  item.dataset['commentId'] = comment.id;
  item.append(element('span', 'comment__index', String(position).padStart(2, '0')));

  if (options.editingCommentId === comment.id) {
    item.append(renderCommentForm(comment, options));
    return item;
  }

  const meta = element(
    'p',
    'comment__meta',
    `${comment.category} · ${PRIORITY_BADGES[comment.priority]}`,
  );
  meta.title = `Priority: ${PRIORITY_LABELS[comment.priority]}`;

  const body = element('div', 'comment__body');
  body.append(meta, element('p', 'comment__text', comment.text));
  item.dataset['priority'] = comment.priority;

  const evidence = element('details', 'comment__evidence');
  evidence.id = `evidence-${comment.id}`;
  evidence.open = comment.attachments.some((attachment) => attachment.id === options.pendingDeleteAttachmentId);
  evidence.append(element('summary', 'evidence-toggle', `Evidence & context${comment.attachments.length > 0 ? ` · ${comment.attachments.length} images` : ''}`));

  if (comment.anchorLabel !== null) {
    body.append(element('p', 'comment__anchor', `Pinned to ${comment.anchorLabel}`));
  }

  if (comment.frameworkEvidence !== null) {
    evidence.append(
      element(
        'p',
        'comment__framework',
        frameworkStatusMessage(comment.frameworkEvidence),
      ),
    );
  }

  if (comment.sourceMapEvidence !== null) {
    evidence.append(
      element(
        'p',
        'comment__source-map',
        sourceMapStatusMessage(comment.sourceMapEvidence),
      ),
    );
  }

  if (comment.attachments.length > 0) {
    const figures = element('div', 'comment__figures');
    for (const attachment of comment.attachments) {
      figures.append(renderAttachmentFigure(comment, attachment, position, options));
    }
    evidence.append(figures);
  }

  const captureStatus =
    comment.visualEvidence === null ? null : captureStatusMessage(comment.visualEvidence);
  if (captureStatus !== null) {
    body.append(element('p', 'comment__capture-status', captureStatus));
  }

  evidence.append(
    element(
      'p',
      'comment__time',
      comment.updatedAt === comment.createdAt
        ? `Created ${formatDisplayTime(comment.createdAt)}`
        : `Created ${formatDisplayTime(comment.createdAt)} · edited ${formatDisplayTime(comment.updatedAt)}`,
    ),
  );
  body.append(evidence);

  if (options.pendingDeleteCommentId === comment.id) {
    body.append(renderCommentDeleteConfirmation(comment, options));
  } else {
    const actions = element('div', 'comment__actions');
    actions.append(
      button('Edit note', 'action action--ghost', () => options.onEditComment?.(comment.id)),
      button('Delete note', 'action action--ghost', () =>
        options.onRequestDeleteComment?.(comment.id),
      ),
    );
    body.append(actions);
  }

  item.append(body);
  return item;
}

function renderCommentsSection(
  state: ReviewPanelState,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('section', 'section notes-section');
  section.append(sectionHeader('', 'notes-title', `Notes (${state.comments.length})`));

  if (state.selectedSession === null) {
    section.append(element('p', 'empty', 'Select a session to read its notes.'));
    return section;
  }

  if (state.comments.length === 0) {
    section.append(
      element(
        'p',
        'empty',
        state.selectedSession.annotationPaused
          ? 'No notes yet. Open the saved page and resume this review to add one.'
          : state.selectedSession.id === state.currentSession?.id && state.selectedSession.status === 'active'
          ? 'Your first note starts on the page. Click the element you want to improve.'
          : 'No notes in this session. Start a new review to annotate this page.',
      ),
    );
    return section;
  }

  const list = element('ol', 'comment-list');
  state.comments.forEach((comment, position) => {
    list.append(renderCommentRow(comment, position + 1, options));
  });
  section.append(list);
  return section;
}

function renderSessionsSection(
  state: ReviewPanelState,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('details', 'section session-history');
  section.id = 'session-history';
  section.append(element('summary', 'disclosure-title', `Stored sessions (${state.sessions.length})`));

  if (state.sessions.length === 0) {
    section.append(element('p', 'empty', 'No sessions stored yet.'));
    return section;
  }

  const list = element('div', 'session-list');
  state.sessions.forEach((session, position) => {
    const row = element('button', 'session-row');
    row.type = 'button';
    row.append(element('span', 'session-row__index', String(position + 1).padStart(2, '0')));

    const body = element('span', 'session-row__body');
    body.append(
      element('span', 'session-row__name', session.name),
      element(
        'span',
        'session-row__meta',
        `${session.hostname} · ${session.status === 'active' ? (session.annotationPaused ? 'Paused' : 'Active') : 'Stopped'} · ${formatDisplayTime(session.startedAt)}`,
      ),
    );
    row.append(body);

    if (session.id === state.selectedSession?.id) {
      row.setAttribute('aria-current', 'true');
    }
    row.addEventListener('click', () => options.onSelectSession?.(session.id));
    const entry = element('div', 'session-entry');
    entry.append(row, savedPageLink(session));
    list.append(entry);
  });

  section.append(list);
  return section;
}

/**
 * Renders the session lifecycle and the comment list of the side panel. Pure DOM, no
 * framework, no `chrome.*`: the view only consumes the core read model it is given and
 * reports user intents back.
 */
export function renderReviewPanel(
  root: HTMLElement,
  state: ReviewPanelState,
  options: ReviewPanelViewOptions = {},
): void {
  const previous = root.querySelector<HTMLElement>('.panel');
  const sameSession = previous?.dataset['sessionId'] === (state.selectedSession?.id ?? '');
  const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement : null;
  const focusKey = focused?.dataset['focusKey'];
  const previousAutofocusKey = root.querySelector<HTMLElement>('[data-autofocus]')?.dataset['focusKey'];
  const openDetails = new Map([...root.querySelectorAll('details')].map((node) => [node.id, node.open]));
  const oldEditor = root.querySelector('.comment-form')?.closest<HTMLElement>('[data-comment-id]')?.dataset['commentId'];
  const drafts = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.field__input')]
    .filter((node) => node.id === 'session-name-input'
      ? node instanceof HTMLInputElement && node.value !== node.defaultValue
      : oldEditor === options.editingCommentId)
    .map((node) => ({ id: node.id, value: node.value, start: node instanceof HTMLSelectElement ? null : node.selectionStart, end: node instanceof HTMLSelectElement ? null : node.selectionEnd }));
  const panel = element('article', 'panel');
  panel.dataset['sessionId'] = state.selectedSession?.id ?? '';
  panel.append(renderMasthead(state.extensionName, `v${state.extensionVersion} · ${state.runtimeLabel}`));

  const notice = options.notice;
  if (notice !== undefined && notice !== null && notice.length > 0) {
    panel.append(renderNotice(notice));
  }

  panel.append(
    renderCurrentPageSection(state, options),
  );

  if (state.selectedSession === null) {
    const welcome = element('section', 'welcome');
    welcome.append(
      element('span', 'welcome__mark', '↗'),
      element('h2', 'welcome__title', 'A clearer way to give feedback.'),
      element('p', 'welcome__description', 'Turn what you see into clear, actionable feedback for your coding agent.'),
    );
    const steps = element('ol', 'welcome__steps');
    for (const [title, description] of [
      ['Start a review', 'Choose the page you want to improve.'],
      ['Point out what matters', 'Click an element and describe the change.'],
      ['Hand it to your agent', 'Copy a brief with the evidence included.'],
    ]) {
      const step = element('li', 'welcome__step');
      step.append(element('strong', '', title), element('span', '', description));
      steps.append(step);
    }
    welcome.append(steps);
    panel.append(welcome);
  } else {
    const heading = element('div', 'review-heading');
    heading.append(element('p', 'eyebrow', 'Selected review'), element('h2', 'review-heading__name', state.selectedSession.name));
    heading.append(savedPageLink(state.selectedSession));
    if (state.selectedSession.id !== state.currentSession?.id) {
      heading.append(element('p', 'page-hint', `Viewing saved notes for ${state.selectedSession.hostname}. Page controls above apply to the current tab.`));
      if (state.selectedSession.status === 'active' && state.selectedSession.annotationPaused) {
        heading.append(statusBadge('active', true), element('p', 'page-hint', 'Open the saved page above, then resume this review.'));
      }
    }
    panel.append(heading, renderCommentsSection(state, options), renderSessionSection(state.selectedSession, options));
  }
  panel.append(renderSessionsSection(state, options), renderFooter(options));
  if (state.selectedSession !== null) panel.append(renderHandoffBlock(state.selectedSession, options));

  for (const node of panel.querySelectorAll<HTMLElement>('button, input, textarea, select, summary, a')) {
    const context = node.closest<HTMLElement>('[data-attachment-id], [data-comment-id]');
    node.dataset['focusKey'] = node.dataset['focusId'] || node.id || `${context?.dataset['attachmentId'] ?? context?.dataset['commentId'] ?? ''}:${node.textContent}`;
  }
  if (sameSession) {
    for (const details of panel.querySelectorAll('details')) {
      if (!details.open) details.open = openDetails.get(details.id) ?? false;
    }
    for (const draft of drafts) {
      const field = [...panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.field__input')].find((node) => node.id === draft.id);
      if (field !== undefined) {
        field.value = draft.value;
        if (!(field instanceof HTMLSelectElement) && draft.start !== null) field.setSelectionRange(draft.start, draft.end);
      }
    }
  }
  root.replaceChildren(panel);
  const nextFocus = sameSession && focusKey !== undefined
    ? [...panel.querySelectorAll<HTMLElement>('[data-focus-key]')].find((node) => node.dataset['focusKey'] === focusKey)
    : undefined;
  const autofocus = panel.querySelector<HTMLElement>('[data-autofocus]');
  const newEditor = oldEditor !== options.editingCommentId ? panel.querySelector<HTMLElement>('#comment-text-input') : null;
  const enteringConfirmation = autofocus !== null && (!sameSession || autofocus.dataset['focusKey'] !== previousAutofocusKey);
  const target = (enteringConfirmation ? autofocus : null) ?? newEditor ?? nextFocus;
  if (target) target.focus({ preventScroll: true });
  else if (focused) {
    const fallback = panel.querySelector<HTMLElement>('#notes-title, .welcome__title');
    if (fallback) { fallback.tabIndex = -1; fallback.focus({ preventScroll: true }); }
  }
}

export function renderReviewPanelError(
  root: HTMLElement,
  message: string,
  options: ReviewPanelViewOptions = {},
): void {
  const panel = element('article', 'panel');
  panel.append(renderMasthead('UI Review', 'Session state unavailable'));
  panel.append(renderNotice(`The side panel could not read its session state: ${message}`));
  panel.append(renderFooter(options));
  root.replaceChildren(panel);
}
