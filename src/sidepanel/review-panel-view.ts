import type { ReviewPanelState, SessionSummary } from '@core';

export interface ReviewPanelViewOptions {
  readonly selectedSessionId?: string | null;
  readonly pendingClearSessionId?: string | null;
  readonly notice?: string | null;
  readonly onRefresh?: () => void;
  readonly onStartReview?: () => void;
  readonly onStopReview?: (sessionId: string) => void;
  readonly onRenameSession?: (sessionId: string, name: string) => void;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onRequestClearSession?: (sessionId: string) => void;
  readonly onConfirmClearSession?: (sessionId: string) => void;
  readonly onCancelClearSession?: () => void;
}

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

function renderSessionsSection(
  state: ReviewPanelState,
  selectedSessionId: string | null,
  options: ReviewPanelViewOptions,
): HTMLElement {
  const section = element('section', 'section');
  section.append(sectionHeader('03', 'sessions-title', `Stored sessions (${state.sessions.length})`));

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

    if (session.id === selectedSessionId) {
      row.setAttribute('aria-current', 'true');
    }
    row.addEventListener('click', () => options.onSelectSession?.(session.id));
    list.append(row);
  });

  section.append(list);
  return section;
}

function resolveSession(
  state: ReviewPanelState,
  options: ReviewPanelViewOptions,
): SessionSummary | null {
  const requested = options.selectedSessionId;
  if (requested !== undefined && requested !== null) {
    const found = state.sessions.find((session) => session.id === requested);
    if (found !== undefined) {
      return found;
    }
  }
  return state.currentSession ?? state.sessions[0] ?? null;
}

/**
 * Renders the session lifecycle of the side panel. Pure DOM, no framework, no `chrome.*`:
 * the view only consumes the core read model it is given and reports user intents back.
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

  const selected = resolveSession(state, options);
  panel.append(
    renderCurrentPageSection(state, options),
    renderSessionSection(selected, options),
    renderSessionsSection(state, selected?.id ?? null, options),
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
