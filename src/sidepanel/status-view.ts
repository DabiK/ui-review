import type { WorkspaceStatus } from '@core';

export interface StatusViewOptions {
  readonly onRefresh?: () => void;
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

function ledgerRow(term: string, value: string, hint?: string): [HTMLElement, HTMLElement] {
  const dt = element('dt', 'ledger__term', term);
  const dd = element('dd', 'ledger__value', value);
  if (hint !== undefined) {
    dd.append(element('span', 'ledger__hint', hint));
  }
  return [dt, dd];
}

function renderFooter(options: StatusViewOptions): HTMLElement {
  const footer = element('footer', 'footer');
  const button = element('button', 'action', 'Refresh status');
  button.type = 'button';
  if (options.onRefresh !== undefined) {
    button.addEventListener('click', options.onRefresh);
  }
  footer.append(button, element('p', 'footnote', 'Nothing leaves this machine — sessions are stored locally.'));
  return footer;
}

/**
 * Renders the foundation status of the side panel. Pure DOM, no framework, no `chrome.*`:
 * the view only consumes the core read model it is given.
 */
export function renderStatusView(
  root: HTMLElement,
  status: WorkspaceStatus,
  options: StatusViewOptions = {},
): void {
  const panel = element('article', 'panel');

  const masthead = element('header', 'masthead');
  masthead.append(
    element('p', 'masthead__kicker', 'Local-first UI review'),
    element('h1', 'masthead__title', status.extensionName),
    element('p', 'masthead__meta', `Foundation · v${status.extensionVersion}`),
  );

  const section = element('section', 'section');
  section.setAttribute('aria-labelledby', 'status-title');
  const title = element('h2', 'section__title');
  title.id = 'status-title';
  title.append(
    element('span', 'section__index', '00'),
    document.createTextNode('Foundation status'),
  );

  const ledger = element('dl', 'ledger');
  ledger.append(
    ...ledgerRow('Extension', 'Loaded in the side panel', status.runtimeLabel),
    ...ledgerRow(
      'Domain core',
      'review-core',
      'Independent from Chrome, the DOM and frameworks',
    ),
    ...ledgerRow(
      'Storage',
      status.storage.label,
      status.storage.persistent ? 'Persistent local storage' : 'Ephemeral storage',
    ),
    ...ledgerRow('Sessions', String(status.sessionCount)),
    ...ledgerRow('Active sessions', String(status.activeSessionCount)),
  );

  section.append(title, ledger);
  panel.append(masthead, section, renderFooter(options));
  root.replaceChildren(panel);
}

export function renderErrorView(
  root: HTMLElement,
  message: string,
  options: StatusViewOptions = {},
): void {
  const panel = element('article', 'panel');

  const masthead = element('header', 'masthead');
  masthead.append(
    element('p', 'masthead__kicker', 'Local-first UI review'),
    element('h1', 'masthead__title', 'UI Review'),
    element('p', 'masthead__meta', 'Foundation · status unavailable'),
  );

  const section = element('section', 'section');
  section.setAttribute('aria-labelledby', 'status-title');
  const title = element('h2', 'section__title');
  title.id = 'status-title';
  title.append(element('span', 'section__index', '00'), document.createTextNode('Foundation status'));

  const alert = element('p', 'error');
  alert.setAttribute('role', 'alert');
  alert.textContent = `The side panel could not read its status: ${message}`;

  section.append(title, alert);
  panel.append(masthead, section, renderFooter(options));
  root.replaceChildren(panel);
}
