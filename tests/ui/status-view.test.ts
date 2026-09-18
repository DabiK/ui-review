// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceStatus } from '@core';
import { renderErrorView, renderStatusView } from '../../src/sidepanel/status-view';

const status: WorkspaceStatus = {
  extensionName: 'UI Review',
  extensionVersion: '0.1.0',
  runtimeLabel: 'Chrome MV3 side panel',
  storage: {
    kind: 'indexeddb',
    persistent: true,
    label: 'IndexedDB (this browser profile)',
  },
  sessionCount: 3,
  activeSessionCount: 1,
};

describe('renderStatusView', () => {
  it('renders the foundation status from the core read model', () => {
    const root = document.createElement('div');

    renderStatusView(root, status);

    expect(root.querySelector('h1')?.textContent).toBe('UI Review');
    expect(root.textContent).toContain('v0.1.0');
    expect(root.textContent).toContain('Chrome MV3 side panel');
    expect(root.textContent).toContain('IndexedDB (this browser profile)');
    expect(root.textContent).toContain('Persistent local storage');
    expect(root.textContent).toContain('review-core');
    expect(root.textContent).toContain('3');
    expect(root.textContent).toContain('1');
  });

  it('exposes the refresh action as a real button', () => {
    const root = document.createElement('div');
    const onRefresh = vi.fn();

    renderStatusView(root, status, { onRefresh });

    const button = root.querySelector('button');
    expect(button?.textContent).toBe('Refresh status');
    button?.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('replaces previous content instead of stacking it', () => {
    const root = document.createElement('div');

    renderStatusView(root, status);
    renderStatusView(root, { ...status, sessionCount: 5 });

    expect(root.querySelectorAll('.panel')).toHaveLength(1);
    expect(root.textContent).toContain('5');
  });

  it('renders an explicit alert when status is unavailable', () => {
    const root = document.createElement('div');

    renderErrorView(root, 'IndexedDB blocked by policy');

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('IndexedDB blocked by policy');
  });
});
