import { describe, expect, it } from 'vitest';
import {
  REVIEW_BRIEF_SCHEMA_VERSION,
  buildReviewBrief,
  createDomEvidence,
  createFrameworkEvidence,
  createReviewComment,
  createReviewSession,
  parseReviewBriefDocument,
  renderReviewBriefMarkdown,
  type FrameworkObservation,
  type ReviewComment,
  type ReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { captureCommentEvidence } from '@core';
import {
  FakeScreenshotCaptureAdapter,
  TINY_PNG_DATA_URL,
  createTinyCapturedImage,
} from '@adapters/runtime/fake-screenshot-capture';
import { FakeComponentContextAdapter } from '@adapters/runtime/fake-component-context';

const STARTED_AT = '2026-09-18T10:00:00.000Z';
const GENERATED_AT = '2026-09-18T10:06:00.000Z';
const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };

function makeSession(): ReviewSession {
  const comment: ReviewComment = createReviewComment({
    id: 'comment-1',
    sessionId: 'session-1',
    text: 'The primary button is too close to the helper text.',
    pageUrl: PAGE_URL,
    viewport: VIEWPORT,
    createdAt: '2026-09-18T10:05:00.000Z',
    category: 'UI',
    priority: 'important',
    evidence: [
      createDomEvidence({
        id: 'evidence-dom',
        commentId: 'comment-1',
        capturedAt: '2026-09-18T10:05:01.000Z',
        anchor: {
          fingerprint: '#checkout > form > button:nth-of-type(1)',
          ancestry: ['body', '#checkout', 'form'],
          text: 'Continue',
          role: 'button',
          accessibleName: 'Continue',
          attributes: { id: 'submit', class: 'primary' },
          boundingBox: { x: 240, y: 512, width: 138, height: 46 },
          viewport: VIEWPORT,
          computedStyles: { display: 'inline-block' },
        },
      }),
    ],
  });

  return createReviewSession({
    id: 'session-1',
    name: 'example.com — 18 Sep 2026, 10:00',
    pageUrl: PAGE_URL,
    startedAt: STARTED_AT,
    comments: [comment],
  });
}

/** A session whose comment carries two real screenshots, captured by the real use case. */
async function sessionWithScreenshots(): Promise<ReviewSession> {
  const sessions = new InMemoryReviewSessionRepository();
  const clock = new FixedClockAdapter(STARTED_AT);
  const ids = new SequentialIdGeneratorAdapter('screenshot');
  const session = makeSession();
  await sessions.save(session);

  await captureCommentEvidence(
    {
      sessions,
      screenshots: new FakeScreenshotCaptureAdapter({
        outcome: {
          viewport: createTinyCapturedImage({ width: 1440, height: 900, byteLength: 4096 }),
          elementCrop: createTinyCapturedImage({ width: 138, height: 46, byteLength: 512 }),
          failureReason: null,
        },
      }),
      components: new FakeComponentContextAdapter(),
      clock,
      ids,
    },
    { sessionId: 'session-1', commentId: 'comment-1', capture: {
      tabId: 7,
      frameId: 0,
      fingerprint: '#checkout > form > button:nth-of-type(1)',
      rect: { x: 240, y: 512, width: 138, height: 46 },
      viewport: VIEWPORT,
    } },
  );

  const stored = await sessions.findById('session-1');
  if (stored === null) {
    throw new Error('expected the session to be stored');
  }
  return stored;
}

function pathsFor(directory = '/tmp/ui-review/handoff/session-1'): {
  directory: string;
  markdownPath: string;
  jsonPath: string;
  filePaths: Record<string, string>;
} {
  return {
    directory,
    markdownPath: `${directory}/review.md`,
    jsonPath: `${directory}/review.json`,
    filePaths: {
      '01-viewport-screenshot.png': `${directory}/01-viewport-screenshot.png`,
      '01-element-crop.png': `${directory}/01-element-crop.png`,
    },
  };
}

describe('buildReviewBrief', () => {
  it('builds a versioned document with deterministic comment indexes and file names', async () => {
    const session = await sessionWithScreenshots();

    const first = buildReviewBrief(session, { generatedAt: GENERATED_AT });
    const second = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    expect(first).toEqual(second);
    expect(first.brief.schemaVersion).toBe(REVIEW_BRIEF_SCHEMA_VERSION);
    expect(first.brief.session).toEqual({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026, 10:00',
      status: 'active',
      pageUrl: PAGE_URL,
      hostname: 'example.com',
      startedAt: STARTED_AT,
      stoppedAt: null,
    });
    expect(first.brief.comments).toHaveLength(1);
    expect(first.brief.comments[0]).toMatchObject({
      index: 1,
      id: 'comment-1',
      category: 'UI',
      priority: 'important',
      evidence: {
        dom: { confidence: 'confirmed', role: 'button' },
        visual: { confidence: 'confirmed', viewport: 'captured', elementCrop: 'captured' },
      },
    });
    expect(first.files.map((file) => file.name)).toEqual([
      '01-viewport-screenshot.png',
      '01-element-crop.png',
    ]);
    expect(first.files.every((file) => file.mediaType === 'image/png')).toBe(true);
    expect(first.files[0]?.content.byteLength).toBeGreaterThan(0);
  });

  it('names repeated attachments uniquely instead of overwriting them', () => {
    const comment: ReviewComment = {
      ...createReviewComment({
        id: 'comment-1',
        sessionId: 'session-1',
        text: 'Both captures matter.',
        pageUrl: PAGE_URL,
        viewport: VIEWPORT,
        createdAt: STARTED_AT,
      }),
      attachments: [
        {
          id: 'a1',
          commentId: 'comment-1',
          kind: 'element-crop',
          mimeType: 'image/png',
          width: 10,
          height: 10,
          byteLength: 70,
          createdAt: STARTED_AT,
          storage: { type: 'inline-data-url', dataUrl: TINY_PNG_DATA_URL },
        },
        {
          id: 'a2',
          commentId: 'comment-1',
          kind: 'element-crop',
          mimeType: 'image/png',
          width: 10,
          height: 10,
          byteLength: 70,
          createdAt: STARTED_AT,
          storage: { type: 'inline-data-url', dataUrl: TINY_PNG_DATA_URL },
        },
      ],
    };
    const session: ReviewSession = { ...makeSession(), comments: [comment] };

    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    expect(bundle.files.map((file) => file.name)).toEqual([
      '01-element-crop.png',
      '01-element-crop-2.png',
    ]);
    expect(bundle.brief.comments[0]?.attachments.map((attachment) => attachment.file)).toEqual([
      '01-element-crop.png',
      '01-element-crop-2.png',
    ]);
  });

  it('reports an attachment that cannot be exported instead of inventing a file', () => {
    const comment: ReviewComment = {
      ...createReviewComment({
        id: 'comment-1',
        sessionId: 'session-1',
        text: 'External artifact.',
        pageUrl: PAGE_URL,
        viewport: VIEWPORT,
        createdAt: STARTED_AT,
      }),
      attachments: [
        {
          id: 'a1',
          commentId: 'comment-1',
          kind: 'viewport-screenshot',
          mimeType: 'image/png',
          width: 10,
          height: 10,
          byteLength: 70,
          createdAt: STARTED_AT,
          storage: { type: 'local-artifact', path: '/app-data/session-1/shot.png' },
        },
      ],
    };
    const session: ReviewSession = { ...makeSession(), comments: [comment] };

    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    expect(bundle.files).toEqual([]);
    expect(bundle.brief.comments[0]?.attachments[0]).toMatchObject({
      file: null,
      unavailableReason: expect.stringContaining('outside the browser profile'),
    });
  });

  it('never exports an image format the bridge does not accept', () => {
    const comment: ReviewComment = {
      ...createReviewComment({
        id: 'comment-1',
        sessionId: 'session-1',
        text: 'GIF attachment.',
        pageUrl: PAGE_URL,
        viewport: VIEWPORT,
        createdAt: STARTED_AT,
      }),
      attachments: [
        {
          id: 'a1',
          commentId: 'comment-1',
          kind: 'element-crop',
          mimeType: 'image/gif',
          width: 10,
          height: 10,
          byteLength: 70,
          createdAt: STARTED_AT,
          storage: {
            type: 'inline-data-url',
            dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
          },
        },
      ],
    };
    const session: ReviewSession = { ...makeSession(), comments: [comment] };

    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    expect(bundle.files).toEqual([]);
    expect(bundle.brief.comments[0]?.attachments[0]?.file).toBeNull();
  });
});

describe('renderReviewBriefMarkdown', () => {
  it('contains the context, the agent instructions and one section per comment id', async () => {
    const session = await sessionWithScreenshots();
    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });
    const paths = pathsFor();

    const markdown = renderReviewBriefMarkdown(bundle.brief, paths);

    expect(markdown).toContain('# UI Review brief');
    expect(markdown).toContain('https://example.com/pricing');
    expect(markdown).toContain(`${paths.jsonPath} (schema version 1)`);
    expect(markdown).toContain('report exactly one result with that same ID');
    expect(markdown).toContain('do\nnot refactor, restyle or fix anything outside their scope.');
    expect(markdown).toContain('### 01 — UI · important');
    expect(markdown).toContain('Comment ID: comment-1');
    expect(markdown).toContain('Selector: #checkout > form > button:nth-of-type(1)');
    expect(markdown).toContain('DOM evidence: confirmed');
    expect(markdown).toContain(`Viewport screenshot: ${paths.filePaths['01-viewport-screenshot.png']}`);
    expect(markdown).toContain(`![Viewport screenshot](<${paths.filePaths['01-viewport-screenshot.png']}>)`);
    expect(markdown).toContain(`Element crop: ${paths.filePaths['01-element-crop.png']}`);
  });

  it('is deterministic and ends with a single newline', async () => {
    const session = await sessionWithScreenshots();
    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    const markdown = renderReviewBriefMarkdown(bundle.brief, pathsFor());

    expect(renderReviewBriefMarkdown(bundle.brief, pathsFor())).toBe(markdown);
    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});

describe('parseReviewBriefDocument', () => {
  it('accepts the exact serialized form of a built brief', async () => {
    const session = await sessionWithScreenshots();
    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    const parsed = parseReviewBriefDocument(JSON.parse(JSON.stringify(bundle.brief)));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual(bundle.brief);
    }
  });

  it('refuses an unknown schema version explicitly', async () => {
    const session = await sessionWithScreenshots();
    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    const parsed = parseReviewBriefDocument({ ...bundle.brief, schemaVersion: 2 });

    expect(parsed).toMatchObject({ ok: false, code: 'unsupported-brief-version' });
  });

  it('refuses unknown fields, non-sequential indexes and dangling files', async () => {
    const session = await sessionWithScreenshots();
    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    const extraField = parseReviewBriefDocument({ ...bundle.brief, extra: true });
    const wrongIndex = parseReviewBriefDocument({
      ...bundle.brief,
      comments: [{ ...bundle.brief.comments[0], index: 2 }],
    });
    const danglingFile = parseReviewBriefDocument({
      ...bundle.brief,
      comments: [
        {
          ...bundle.brief.comments[0],
          attachments: [
            { ...bundle.brief.comments[0]?.attachments[0], file: '../escape.png' },
          ],
        },
      ],
    });

    expect(extraField.ok).toBe(false);
    expect(wrongIndex.ok).toBe(false);
    expect(danglingFile).toMatchObject({ ok: false, code: 'invalid-brief' });
  });
});

describe('framework evidence in the brief', () => {
  function sessionWithFramework(observation: FrameworkObservation): ReviewSession {
    const comment: ReviewComment = {
      ...createReviewComment({
        id: 'comment-1',
        sessionId: 'session-1',
        text: 'The card spacing is off.',
        pageUrl: PAGE_URL,
        viewport: VIEWPORT,
        createdAt: STARTED_AT,
      }),
      evidence: [
        createFrameworkEvidence({
          id: 'evidence-framework',
          commentId: 'comment-1',
          capturedAt: STARTED_AT,
          observation,
        }),
      ],
    };
    return { ...makeSession(), comments: [comment] };
  }

  it('serializes the framework evidence and renders it in the Markdown', () => {
    const session = sessionWithFramework({
      framework: 'react',
      componentName: 'PricingCard',
      componentChain: ['PricingPage', 'PricingCard'],
      confidence: 'inferred',
    });

    const bundle = buildReviewBrief(session, { generatedAt: GENERATED_AT });

    expect(bundle.brief.comments[0]?.evidence.framework).toEqual({
      confidence: 'inferred',
      framework: 'react',
      componentName: 'PricingCard',
      componentChain: ['PricingPage', 'PricingCard'],
    });

    const markdown = renderReviewBriefMarkdown(bundle.brief, pathsFor());
    expect(markdown).toContain('Framework evidence: inferred — react · PricingCard');
    expect(markdown).toContain('Component chain: PricingPage > PricingCard');

    const parsed = parseReviewBriefDocument(JSON.parse(JSON.stringify(bundle.brief)));
    expect(parsed.ok).toBe(true);
  });

  it('states an unavailable framework context instead of inventing a component', () => {
    const session = sessionWithFramework({
      framework: 'unknown',
      componentName: null,
      componentChain: [],
      confidence: 'unavailable',
    });

    const markdown = renderReviewBriefMarkdown(
      buildReviewBrief(session, { generatedAt: GENERATED_AT }).brief,
      pathsFor(),
    );

    expect(markdown).toContain('Framework context: unavailable');
    expect(markdown).not.toContain('unknown component');
  });
});
