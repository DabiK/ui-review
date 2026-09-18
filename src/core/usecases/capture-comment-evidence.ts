import {
  createAttachment,
  createEvidence,
  type Attachment,
  type AttachmentKind,
  type Confidence,
} from '../model/evidence';
import { DomainValidationError } from '../model/errors';
import type { CommentId, SessionId } from '../model/ids';
import type { ReviewComment } from '../model/review-comment';
import type { ReviewSessionRepository } from '../ports/review-session-repository';
import type { ClockPort } from '../ports/clock';
import type { IdGeneratorPort } from '../ports/id-generator';
import type {
  CapturedImage,
  ScreenshotCaptureOutcome,
  ScreenshotCapturePort,
  ScreenshotCaptureRequest,
} from '../ports/screenshot-capture';

/**
 * Attaches the visual evidence of a pinned element to an existing comment: one viewport
 * screenshot, one element crop and an explicit capture status. A capture failure is a
 * recorded outcome, never a thrown error, so the text/DOM comment stays usable.
 */

const DEFAULT_FAILURE_REASON = 'The screenshot could not be captured.';
const NO_TAB_REASON = 'Screenshots are unavailable because no browser tab context was provided.';

export interface CaptureCommentEvidenceInput {
  readonly sessionId: SessionId;
  readonly commentId: CommentId;
  /** `null` when the transport could not provide a tab context; recorded as a failure. */
  readonly capture: ScreenshotCaptureRequest | null;
}

export interface CaptureCommentEvidenceDeps {
  readonly sessions: ReviewSessionRepository;
  readonly screenshots: ScreenshotCapturePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export type CaptureCommentEvidenceResult =
  | { readonly ok: true; readonly comment: ReviewComment }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'comment-not-found'; readonly commentId: CommentId };

export async function captureCommentEvidence(
  deps: CaptureCommentEvidenceDeps,
  input: CaptureCommentEvidenceInput,
): Promise<CaptureCommentEvidenceResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }

  const comment = session.comments.find((candidate) => candidate.id === input.commentId);
  if (comment === undefined) {
    return { ok: false, reason: 'comment-not-found', commentId: input.commentId };
  }

  const capturedAt = deps.clock.now();
  const outcome = await captureScreenshots(deps.screenshots, input.capture);

  const viewportAttachment = buildAttachment(
    deps.ids,
    comment.id,
    'viewport-screenshot',
    outcome.viewport,
    capturedAt,
  );
  const cropAttachment = buildAttachment(
    deps.ids,
    comment.id,
    'element-crop',
    outcome.elementCrop,
    capturedAt,
  );

  const attachments = [viewportAttachment, cropAttachment].filter(
    (attachment): attachment is Attachment => attachment !== null,
  );
  const capturedEverything = viewportAttachment !== null && cropAttachment !== null;

  const evidence = createEvidence({
    id: deps.ids.createId(),
    commentId: comment.id,
    capturedAt,
    confidence: confidenceFor(viewportAttachment, cropAttachment),
    payload: {
      type: 'visual',
      viewport: viewportAttachment === null ? 'failed' : 'captured',
      elementCrop: cropAttachment === null ? 'failed' : 'captured',
      reason: capturedEverything ? null : failureReason(outcome),
    },
  });

  const updated: ReviewComment = {
    ...comment,
    attachments: [...comment.attachments, ...attachments],
    evidence: [...comment.evidence, evidence],
  };

  await deps.sessions.save({
    ...session,
    comments: session.comments.map((candidate) =>
      candidate.id === comment.id ? updated : candidate,
    ),
  });

  return { ok: true, comment: updated };
}

async function captureScreenshots(
  screenshots: ScreenshotCapturePort,
  request: ScreenshotCaptureRequest | null,
): Promise<ScreenshotCaptureOutcome> {
  if (request === null) {
    return { viewport: null, elementCrop: null, failureReason: NO_TAB_REASON };
  }
  try {
    return await screenshots.capture(request);
  } catch {
    // Resilience: a broken capture adapter must not cost the reviewer their note.
    return { viewport: null, elementCrop: null, failureReason: DEFAULT_FAILURE_REASON };
  }
}

function buildAttachment(
  ids: IdGeneratorPort,
  commentId: CommentId,
  kind: AttachmentKind,
  image: CapturedImage | null,
  createdAt: string,
): Attachment | null {
  if (image === null) {
    return null;
  }

  try {
    return createAttachment({
      id: ids.createId(),
      commentId,
      kind,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteLength: image.byteLength,
      createdAt,
      storage: { type: 'inline-data-url', dataUrl: image.dataUrl },
    });
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return null;
    }
    throw error;
  }
}

function confidenceFor(
  viewport: Attachment | null,
  elementCrop: Attachment | null,
): Confidence {
  if (viewport !== null && elementCrop !== null) {
    return 'confirmed';
  }
  return viewport === null && elementCrop === null ? 'unavailable' : 'inferred';
}

function failureReason(outcome: ScreenshotCaptureOutcome): string {
  const reason = outcome.failureReason?.trim();
  return reason !== undefined && reason.length > 0 ? reason : DEFAULT_FAILURE_REASON;
}
