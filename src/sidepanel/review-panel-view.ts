import { COMMENT_CATEGORIES, COMMENT_PRIORITIES } from '@core';
import type {
  CommentCategory,
  CommentPriority,
  CommentSummary,
  ReviewPanelState,
  SessionSummary,
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
  readonly notice?: string | null;
  readonly onRefresh?: () => void;
  readonly onStartReview?: () => void;
  readonly onStopReview?: (sessionId: string) => void;
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

function statusBadge(status: SessionSummary['status']): HTMLElement {
  const label = status === 'active' ? 'Review in progress' : 'Review stopped';
  return element('p', `status-badge status-badge--${status}`, label);
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
    element('p', 'masthead__kicker', 'Local-first UI review'),
    element('h1', 'masthead__title', title),
    element('p', 'masthead__meta', meta),
  );
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
      'Sessions are stored locally in this browser profile. Clearing removes only the selected session.',
    ),
    element(
      'p',
      'footnote',
      'While a review is active, click any element on the page to pin a note; press Shift+Escape to leave review mode.',
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
  const section = element('section', 'section');
  section.append(sectionHeader('01', 'current-page-title', 'Current page'));

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
    element('p', 'page-url', page.url),
  );

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
    section.append(statusBadge('active'));
    actions.append(button('Stop review', 'action', () => options.onStopReview?.(current.id)));
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
  const label = element('label', 'field__label', 'Session name');
  label.htmlFor = 'session-name-input';

  const input = element('input', 'field__input');
  input.id = 'session-name-input';
  input.name = 'name';
  input.type = 'text';
  input.value = session.name;
  input.required = true;

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

function renderSessionSection(
  session: SessionSummary | null,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('section', 'section');
  section.append(sectionHeader('02', 'session-title', 'Session'));

  if (session === null) {
    section.append(
      element('p', 'empty', 'No session selected. Start a review on an eligible page.'),
    );
    return section;
  }

  section.append(renderRenameForm(session, options), statusBadge(session.status));

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

  if (comment.anchorLabel !== null) {
    body.append(element('p', 'comment__anchor', `Pinned to ${comment.anchorLabel}`));
  }
  body.append(
    element(
      'p',
      'comment__time',
      comment.updatedAt === comment.createdAt
        ? `Created ${formatDisplayTime(comment.createdAt)}`
        : `Created ${formatDisplayTime(comment.createdAt)} · edited ${formatDisplayTime(comment.updatedAt)}`,
    ),
  );

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
  const section = element('section', 'section');
  section.append(sectionHeader('03', 'notes-title', `Notes (${state.comments.length})`));

  if (state.selectedSession === null) {
    section.append(element('p', 'empty', 'Select a session to read its notes.'));
    return section;
  }

  if (state.comments.length === 0) {
    section.append(
      element(
        'p',
        'empty',
        'No notes yet. Press Start review, then click any element on the page.',
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
  const section = element('section', 'section');
  section.append(sectionHeader('04', 'sessions-title', `Stored sessions (${state.sessions.length})`));

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
        `${session.hostname} · ${session.status === 'active' ? 'Active' : 'Stopped'} · ${formatDisplayTime(session.startedAt)}`,
      ),
    );
    row.append(body);

    if (session.id === state.selectedSession?.id) {
      row.setAttribute('aria-current', 'true');
    }
    row.addEventListener('click', () => options.onSelectSession?.(session.id));
    list.append(row);
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
  const panel = element('article', 'panel');
  panel.append(renderMasthead(state.extensionName, `v${state.extensionVersion} · ${state.runtimeLabel}`));

  const notice = options.notice;
  if (notice !== undefined && notice !== null && notice.length > 0) {
    panel.append(renderNotice(notice));
  }

  panel.append(
    renderCurrentPageSection(state, options),
    renderSessionSection(state.selectedSession, options),
    renderCommentsSection(state, options),
    renderSessionsSection(state, options),
    renderFooter(options),
  );

  root.replaceChildren(panel);
  root.querySelector<HTMLElement>('[data-autofocus]')?.focus();
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
