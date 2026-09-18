import {
  createAttachment,
  createEvidence,
  createFrameworkEvidence,
  createSourceMapEvidence,
  unavailableFrameworkObservation,
  unavailableSourceMapObservation,
  type Attachment,
  type AttachmentKind,
  type Confidence,
  type Evidence,
  type FrameworkObservation,
  type SourceMapObservation,
} from '../model/evidence';
import { DomainValidationError } from '../model/errors';
import type { CommentId, SessionId } from '../model/ids';
import type { ReviewComment } from '../model/review-comment';
import type { ReviewSessionRepository } from '../ports/review-session-repository';
import type { ClockPort } from '../ports/clock';
import type { ComponentContextPort } from '../ports/component-context';
import type { IdGeneratorPort } from '../ports/id-generator';
import type {
  CapturedImage,
  ScreenshotCaptureOutcome,
  ScreenshotCapturePort,
  ScreenshotCaptureRequest,
} from '../ports/screenshot-capture';
import type { SourceMapContextPort, SourceMapResolution } from '../ports/source-map-context';
import { isDirectSourceReference } from '../source-maps/source-reference';

/**
 * Attaches the captured evidence of a pinned element to an existing comment: one viewport
 * screenshot, one element crop, the best-effort framework component context, the source-map
 * location when one can be resolved, and explicit capture statuses. A capture failure is a
 * recorded outcome, never a thrown error, so the text/DOM comment stays usable.
 */

const DEFAULT_FAILURE_REASON = 'The screenshot could not be captured.';
const NO_TAB_REASON = 'Screenshots are unavailable because no browser tab context was provided.';
const NO_SOURCE_REFERENCE_REASON = 'No framework source reference was exposed by the page.';
const SOURCE_MAP_UNAVAILABLE_REASON = 'The source map could not be resolved.';

export interface CommentEvidenceCaptureRequest extends ScreenshotCaptureRequest {
  /** Frame that reported the comment; `null` targets the tab main frame. */
  readonly frameId: number | null;
  /** Stable DOM selector of the pinned element, resolved by the inspection adapter. */
  readonly fingerprint: string;
}

export interface CaptureCommentEvidenceInput {
  readonly sessionId: SessionId;
  readonly commentId: CommentId;
  /** `null` when the transport could not provide a tab context; recorded as a failure. */
  readonly capture: CommentEvidenceCaptureRequest | null;
}

export interface CaptureCommentEvidenceDeps {
  readonly sessions: ReviewSessionRepository;
  readonly screenshots: ScreenshotCapturePort;
  readonly components: ComponentContextPort;
  readonly sourceMaps: SourceMapContextPort;
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
  const framework = await detectComponentContext(deps.components, input.capture);
  const sourceMap = await resolveSourceMapContext(deps.sourceMaps, session.pageUrl, framework);

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

  const visualEvidence = createEvidence({
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
  const frameworkEvidence = buildFrameworkEvidence(
    deps.ids,
    comment.id,
    capturedAt,
    framework,
  );
  const sourceMapEvidence = buildSourceMapEvidence(
    deps.ids,
    comment.id,
    capturedAt,
    sourceMap,
  );

  const updated: ReviewComment = {
    ...comment,
    attachments: [...comment.attachments, ...attachments],
    evidence: [...comment.evidence, visualEvidence, frameworkEvidence, sourceMapEvidence],
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
  request: CommentEvidenceCaptureRequest | null,
): Promise<ScreenshotCaptureOutcome> {
  if (request === null) {
    return { viewport: null, elementCrop: null, failureReason: NO_TAB_REASON };
  }
  try {
    return await screenshots.capture({
      tabId: request.tabId,
      rect: request.rect,
      viewport: request.viewport,
    });
  } catch {
    // Resilience: a broken capture adapter must not cost the reviewer their note.
    return { viewport: null, elementCrop: null, failureReason: DEFAULT_FAILURE_REASON };
  }
}

async function detectComponentContext(
  components: ComponentContextPort,
  request: CommentEvidenceCaptureRequest | null,
): Promise<FrameworkObservation> {
  if (request === null) {
    return unavailableFrameworkObservation();
  }
  try {
    return await components.detect({
      tabId: request.tabId,
      frameId: request.frameId,
      fingerprint: request.fingerprint,
    });
  } catch {
    // Resilience: framework context is best effort and never blocks the annotation.
    return unavailableFrameworkObservation();
  }
}

function buildFrameworkEvidence(
  ids: IdGeneratorPort,
  commentId: CommentId,
  capturedAt: string,
  observation: FrameworkObservation,
): Evidence {
  const id = ids.createId();
  try {
    return createFrameworkEvidence({ id, commentId, capturedAt, observation });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) {
      throw error;
    }
    // An adapter that returns a malformed observation must not cost the note either: the
    // failure becomes an explicit unavailable observation.
    return createFrameworkEvidence({
      id,
      commentId,
      capturedAt,
      observation: unavailableFrameworkObservation(),
    });
  }
}

/**
 * Source locations only make sense when the framework adapter exposed a reference: an
 * arbitrary DOM node must never be given an invented file. A reference that already names a
 * source file is directly observed; anything else is resolved through its source map by the
 * adapter and explicitly inferred.
 */
async function resolveSourceMapContext(
  sourceMaps: SourceMapContextPort,
  pageUrl: string,
  framework: FrameworkObservation,
): Promise<SourceMapObservation> {
  const reference = framework.sourceReference ?? null;
  if (reference === null || typeof reference.fileName !== 'string') {
    return unavailableSourceMapObservation(NO_SOURCE_REFERENCE_REASON);
  }

  if (isDirectSourceReference(reference.fileName)) {
    return {
      sourceFile: reference.fileName,
      line: reference.line,
      column: reference.column,
      confidence: 'confirmed',
      reason: null,
    };
  }

  try {
    return observationFromResolution(await sourceMaps.resolve({ pageUrl, reference }));
  } catch {
    // Resilience: source context is best effort and never blocks the annotation.
    return unavailableSourceMapObservation(SOURCE_MAP_UNAVAILABLE_REASON);
  }
}

function observationFromResolution(resolution: SourceMapResolution): SourceMapObservation {
  if (resolution.kind === 'mapped') {
    return {
      sourceFile: resolution.sourceFile,
      line: resolution.line,
      column: resolution.column,
      confidence: 'inferred',
      reason: resolution.reason,
    };
  }
  if (resolution.kind === 'unavailable') {
    return unavailableSourceMapObservation(resolution.reason);
  }
  // A malformed adapter result must not be trusted as a source location.
  return unavailableSourceMapObservation(SOURCE_MAP_UNAVAILABLE_REASON);
}

function buildSourceMapEvidence(
  ids: IdGeneratorPort,
  commentId: CommentId,
  capturedAt: string,
  observation: SourceMapObservation,
): Evidence {
  const id = ids.createId();
  try {
    return createSourceMapEvidence({ id, commentId, capturedAt, observation });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) {
      throw error;
    }
    return createSourceMapEvidence({
      id,
      commentId,
      capturedAt,
      observation: unavailableSourceMapObservation(SOURCE_MAP_UNAVAILABLE_REASON),
    });
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
