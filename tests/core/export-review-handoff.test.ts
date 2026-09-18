import { describe, expect, it } from 'vitest';
import {
  addReviewComment,
  captureCommentEvidence,
  deleteReviewComment,
  exportReviewHandoff,
  parseReviewBriefDocument,
  startReviewSession,
  type DomAnchor,
  type ReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { InMemoryClipboardAdapter } from '@adapters/runtime/in-memory-clipboard';
import { InMemoryLocalBridgeAdapter } from '@adapters/runtime/in-memory-local-bridge';
import {
  FakeScreenshotCaptureAdapter,
  createTinyCapturedImage,
} from '@adapters/runtime/fake-screenshot-capture';

const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };
const STARTED_AT = '2026-09-18T10:00:00.000Z';
const CAPTURED_AT = '2026-09-18T10:05:00.000Z';

const ANCHOR: DomAnchor = {
  fingerprint: '#checkout > form > button:nth-of-type(1)',
  ancestry: ['body', '#checkout', 'form'],
  text: 'Continue',
  role: 'button',
  accessibleName: 'Continue',
  attributes: { id: 'submit' },
  boundingBox: { x: 240, y: 512, width: 138, height: 46 },
  viewport: VIEWPORT,
  computedStyles: { display: 'inline-block' },
};

interface Harness {
  readonly sessions: InMemoryReviewSessionRepository;
  readonly bridge: InMemoryLocalBridgeAdapter;
  readonly clipboard: InMemoryClipboardAdapter;
  readonly clock: FixedClockAdapter;
  readonly ids: SequentialIdGeneratorAdapter;
  readonly sessionId: string;
}

async function setupHarness(): Promise<Harness> {
  const sessions = new InMemoryReviewSessionRepository();
  const pages = new StaticActivePageAdapter({ url: PAGE_URL, title: 'Pricing' });
  const clock = new FixedClockAdapter(STARTED_AT);
  const ids = new SequentialIdGeneratorAdapter('id');

  const started = await startReviewSession({ sessions, pages, clock, ids });
  if (!started.ok) {
    throw new Error('expected the review to start');
  }

  return {
    sessions,
    bridge: new InMemoryLocalBridgeAdapter(),
    clipboard: new InMemoryClipboardAdapter(),
    clock,
    ids,
    sessionId: started.session.id,
  };
}

async function addComment(harness: Harness, text: string): Promise<string> {
  harness.clock.set(CAPTURED_AT);
  const result = await addReviewComment(
    { sessions: harness.sessions, clock: harness.clock, ids: harness.ids },
    {
      sessionId: harness.sessionId,
      text,
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
      category: 'UI',
      priority: 'important',
      anchor: ANCHOR,
    },
  );
  if (!result.ok) {
    throw new Error(`expected the comment to be added: ${result.reason}`);
  }

  await captureCommentEvidence(
    {
      sessions: harness.sessions,
      screenshots: new FakeScreenshotCaptureAdapter({
        outcome: {
          viewport: createTinyCapturedImage({ width: 1440, height: 900, byteLength: 4096 }),
          elementCrop: createTinyCapturedImage({ width: 138, height: 46, byteLength: 512 }),
          failureReason: null,
        },
      }),
      clock: harness.clock,
      ids: harness.ids,
    },
    {
      sessionId: harness.sessionId,
      commentId: result.comment.id,
      capture: { tabId: 7, rect: ANCHOR.boundingBox, viewport: VIEWPORT },
    },
  );

  return result.comment.id;
}

function exportDeps(harness: Harness) {
  return {
    sessions: harness.sessions,
    bridge: harness.bridge,
    clipboard: harness.clipboard,
    clock: harness.clock,
  };
}

describe('exportReviewHandoff', () => {
  it('materializes the brief, copies the exact Markdown and links real image paths', async () => {
    const harness = await setupHarness();
    const commentId = await addComment(harness, 'The primary button is too close to the helper text.');

    const result = await exportReviewHandoff(exportDeps(harness), {
      sessionId: harness.sessionId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(harness.clipboard.lastWrittenText()).toBe(result.handoff.markdown);
    expect(result.handoff.directory).toContain(harness.sessionId);
    expect(result.handoff.markdownPath).toBe(`${result.handoff.directory}/review.md`);
    expect(result.handoff.jsonPath).toBe(`${result.handoff.directory}/review.json`);

    const json = harness.bridge.readHandoffFile(harness.sessionId, 'review.json');
    const markdown = harness.bridge.readHandoffFile(harness.sessionId, 'review.md');
    expect(json).not.toBeNull();
    expect(markdown).not.toBeNull();

    const parsed = parseReviewBriefDocument(
      JSON.parse(new TextDecoder().decode(json ?? new Uint8Array())),
    );
    expect(parsed.ok).toBe(true);

    expect(result.handoff.markdown).toContain(commentId);
    for (const file of result.handoff.files) {
      expect(harness.bridge.readHandoffFile(harness.sessionId, file.name)).not.toBeNull();
      expect(result.handoff.markdown).toContain(file.path);
    }
    expect(result.handoff.files.map((file) => file.name)).toEqual([
      '01-viewport-screenshot.png',
      '01-element-crop.png',
    ]);
  });

  it('is idempotent: exporting again updates the same directory and keeps one copy of each file', async () => {
    const harness = await setupHarness();
    await addComment(harness, 'First note.');

    const first = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });
    const filesAfterFirst = harness.bridge.handoffFileNames(harness.sessionId);
    const second = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(second.handoff.directory).toBe(first.handoff.directory);
    expect(harness.bridge.handoffFileNames(harness.sessionId)).toEqual(filesAfterFirst);
  });

  it('includes every remaining comment exactly once, in stored order', async () => {
    const harness = await setupHarness();
    const firstId = await addComment(harness, 'First note.');
    const secondId = await addComment(harness, 'Second note.');
    await deleteReviewComment(
      { sessions: harness.sessions },
      { sessionId: harness.sessionId, commentId: firstId },
    );

    const result = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const markdown = result.handoff.markdown;
    expect(markdown).not.toContain(firstId);
    expect(markdown.split(secondId)).toHaveLength(2);
    expect(markdown.indexOf('Second note.')).toBeGreaterThan(-1);
  });

  it('refuses a session that does not exist and an empty session without touching the bridge', async () => {
    const harness = await setupHarness();

    const missing = await exportReviewHandoff(exportDeps(harness), { sessionId: 'nope' });
    const empty = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });

    expect(missing).toMatchObject({ ok: false, reason: 'session-not-found' });
    expect(empty).toMatchObject({ ok: false, reason: 'no-comments' });
    expect(harness.bridge.handoffFileNames(harness.sessionId)).toEqual([]);
    expect(harness.clipboard.lastWrittenText()).toBeNull();
  });

  it('reports an unavailable bridge and keeps the persisted session intact', async () => {
    const harness = await setupHarness();
    await addComment(harness, 'A note that must survive.');
    harness.bridge.setFailure({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The bridge is not installed.',
      code: null,
    });

    const result = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });

    expect(result).toMatchObject({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The bridge is not installed.',
    });
    expect(harness.clipboard.lastWrittenText()).toBeNull();
    const stored = (await harness.sessions.findById(harness.sessionId)) as ReviewSession | null;
    expect(stored?.comments).toHaveLength(1);
  });

  it('reports a clipboard failure after the artifacts are materialized, without deleting the session', async () => {
    const harness = await setupHarness();
    await addComment(harness, 'Clipboard failure note.');
    harness.clipboard.setFailureMessage('Clipboard access was denied.');

    const result = await exportReviewHandoff(exportDeps(harness), { sessionId: harness.sessionId });

    expect(result).toMatchObject({
      ok: false,
      reason: 'clipboard-unavailable',
      message: 'Clipboard access was denied.',
    });
    expect(harness.bridge.handoffFileNames(harness.sessionId)).toContain('review.md');
    expect(harness.clipboard.lastWrittenText()).toBeNull();
    const stored = await harness.sessions.findById(harness.sessionId);
    expect(stored?.comments).toHaveLength(1);
  });
});
