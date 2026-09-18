import { describe, expect, it } from 'vitest';
import {
  buildReviewBrief,
  createAttachment,
  createReviewComment,
  createReviewSession,
  type LocalBridgePort,
  type ReviewBriefBundle,
} from '@core';

export type LocalBridgeScenario = 'available' | 'unavailable';

export interface LocalBridgePortContractOptions {
  readonly createPort: (scenario: LocalBridgeScenario) => LocalBridgePort;
}

const WRITE_INPUT = {
  sessionId: 'session-1',
  name: 'review.json',
  mediaType: 'application/json',
  content: new Uint8Array([1, 2, 3]),
} as const;

function sampleBundle(): ReviewBriefBundle {
  const comment = createReviewComment({
    id: 'comment-1',
    sessionId: 'session-1',
    text: 'The button is misaligned.',
    pageUrl: 'https://example.com/pricing',
    viewport: { width: 1440, height: 900 },
    createdAt: '2026-09-18T10:05:00.000Z',
    attachments: [
      createAttachment({
        id: 'attachment-1',
        commentId: 'comment-1',
        kind: 'element-crop',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 3,
        createdAt: '2026-09-18T10:05:00.000Z',
        storage: { type: 'inline-data-url', dataUrl: 'data:image/png;base64,AQID' },
      }),
    ],
  });
  const session = createReviewSession({
    id: 'session-1',
    name: 'example.com — 18 Sep 2026, 10:00',
    pageUrl: 'https://example.com/pricing',
    startedAt: '2026-09-18T10:00:00.000Z',
    comments: [comment],
  });
  return buildReviewBrief(session, { generatedAt: '2026-09-18T10:06:00.000Z' });
}

/** Behaviour every `LocalBridgePort` implementation must provide. */
export function describeLocalBridgePortContract(options: LocalBridgePortContractOptions): void {
  describe('LocalBridgePort contract', () => {
    it('reports a healthy bridge with its artifact root', async () => {
      const result = await options.createPort('available').checkHealth();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.health.status).toBe('ok');
        expect(result.health.artifactRoot.trim().length).toBeGreaterThan(0);
      }
    });

    it('round-trips an artifact through the bridge protocol', async () => {
      const port = options.createPort('available');

      const written = await port.writeArtifact(WRITE_INPUT);

      expect(written.ok).toBe(true);
      if (!written.ok) {
        return;
      }
      expect(written.artifact.path.trim().length).toBeGreaterThan(0);
      expect(written.artifact.byteLength).toBe(3);

      const read = await port.readArtifact({
        sessionId: WRITE_INPUT.sessionId,
        name: WRITE_INPUT.name,
      });

      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(Array.from(read.artifact.content)).toEqual([1, 2, 3]);
        expect(read.artifact.mediaType).toBe('application/json');
      }
    });

    it('reports a missing artifact with an explicit reason', async () => {
      const result = await options
        .createPort('available')
        .readArtifact({ sessionId: 'session-1', name: 'nope.json' });

      expect(result).toMatchObject({ ok: false, reason: 'artifact-not-found' });
    });

    it('refuses traversal-shaped names without persisting anything', async () => {
      const port = options.createPort('available');

      const written = await port.writeArtifact({ ...WRITE_INPUT, name: '../escape.json' });
      const read = await port.readArtifact({ sessionId: 'session-1', name: 'escape.json' });

      expect(written.ok).toBe(false);
      expect(read.ok).toBe(false);
    });

    it('reports an unavailable bridge as a typed failure', async () => {
      const result = await options.createPort('unavailable').checkHealth();

      expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
    });

    it('materializes a handoff and returns the exact markdown with real paths', async () => {
      const port = options.createPort('available');
      const bundle = sampleBundle();

      const result = await port.materializeHandoff({
        sessionId: bundle.brief.session.id,
        brief: bundle.brief,
        files: bundle.files,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.handoff.directory).toContain('session-1');
      expect(result.handoff.markdownPath).toContain('review.md');
      expect(result.handoff.jsonPath).toContain('review.json');
      expect(result.handoff.markdown).toContain('Comment ID: comment-1');
      for (const file of result.handoff.files) {
        expect(file.path).toBe(`${result.handoff.directory}/${file.name}`);
        expect(result.handoff.markdown).toContain(file.path);
      }
    });

    it('refuses a traversal-shaped session before the wire', async () => {
      const port = options.createPort('available');
      const bundle = sampleBundle();

      const result = await port.materializeHandoff({
        sessionId: '../escape',
        brief: bundle.brief,
        files: bundle.files,
      });

      expect(result).toMatchObject({
        ok: false,
        reason: 'bridge-rejected',
        code: 'invalid-session-id',
      });
    });

    it('never throws for expected failures', async () => {
      const port = options.createPort('unavailable');

      await expect(port.writeArtifact(WRITE_INPUT)).resolves.toBeDefined();
      await expect(
        port.readArtifact({ sessionId: 'session-1', name: 'review.json' }),
      ).resolves.toBeDefined();
      await expect(
        port.materializeHandoff({
          sessionId: 'session-1',
          brief: sampleBundle().brief,
          files: [],
        }),
      ).resolves.toBeDefined();
    });
  });
}
