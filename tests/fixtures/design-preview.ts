/** Deterministic read-model fixture for visual QA. Not part of the extension bundle. */
import type { CommentSummary, ReviewPanelState, SessionSummary } from '@core';
import { renderReviewPanel, type ReviewPanelViewOptions } from '../../src/sidepanel/review-panel-view';
import '../../src/sidepanel/styles.css';

const session: SessionSummary = {
  id: 'preview', name: 'Pricing page review', status: 'active',
  pageUrl: 'https://example.com/pricing', hostname: 'example.com',
  startedAt: '2026-09-18T10:00:00.000Z', stoppedAt: null, commentCount: 3,
};
const texts = [
  'Make the primary action easier to find. Use a stronger contrast against the background.',
  'Align the plan prices so they are easier to compare at a glance.',
  'Explain what happens after the trial ends, directly below the button.',
];
const comments: CommentSummary[] = texts.map((text, index) => ({
  id: `note-${index}`, text, category: index === 2 ? 'Content' : 'UI',
  priority: index === 0 ? 'critical' : 'important',
  createdAt: session.startedAt, updatedAt: session.startedAt,
  anchorLabel: ['Start free trial', 'Plans & pricing', 'Try it for 14 days'][index] ?? '',
  attachments: [], visualEvidence: null,
  frameworkEvidence: { framework: 'react', confidence: 'inferred', componentName: 'PricingCard', componentChain: ['PricingPage', 'PricingCard'] },
  sourceMapEvidence: { confidence: 'unavailable', sourceFile: null, line: null, column: null, reason: 'No development source reference was available.' },
}));
const params = new URLSearchParams(location.search);
const mode = params.get('state') ?? 'active';
const selected = mode === 'empty' || mode === 'restricted' ? null : { ...session, ...(mode === 'stopped' ? { status: 'stopped' as const, stoppedAt: '2026-09-18T10:30:00.000Z' } : {}) };
const state: ReviewPanelState = {
  extensionName: 'UI Review', extensionVersion: '0.1.0', runtimeLabel: 'Chrome MV3 side panel',
  storage: { kind: 'indexeddb', persistent: true, label: 'This browser' },
  activePage: mode === 'restricted'
    ? { url: 'chrome://extensions', title: 'Extensions', hostname: '', eligible: false }
    : { url: session.pageUrl, title: 'Plans & pricing — Acme', hostname: session.hostname, eligible: true },
  currentSession: selected, selectedSession: selected, sessions: selected ? [selected] : [], comments: selected ? comments : [],
};
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing fixture root');
const options: ReviewPanelViewOptions = {
  bridgeSetup: mode === 'bridge-missing'
    ? { kind: 'missing', message: 'The local bridge is not installed for this browser profile.' }
    : { kind: 'ready', bridgeVersion: '0.1.0', platform: 'darwin', artifactRoot: '/tmp/ui-review' },
  editingCommentId: mode === 'edit' ? 'note-0' : null,
  pendingClearSessionId: mode === 'confirm' ? session.id : null,
  notice: mode === 'notice' ? 'Agent brief copied. Artifacts written to /tmp/ui-review/handoff/preview' : null,
  onEditComment: (id) => renderReviewPanel(root, state, { ...options, editingCommentId: id }),
  onCancelEditComment: () => renderReviewPanel(root, state, options),
  onRequestDeleteComment: (id) => renderReviewPanel(root, state, { ...options, pendingDeleteCommentId: id }),
  onCancelDeleteComment: () => renderReviewPanel(root, state, options),
};
renderReviewPanel(root, state, options);
