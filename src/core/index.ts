/**
 * Public surface of the `review-core` domain module.
 *
 * Everything outside the core (adapters, application wiring, UI, tests) must import from
 * this barrel only. Dependencies point inward: nothing in here may import Chrome, DOM,
 * framework, Node or adapter code.
 */
export type { AttachmentId, CommentId, EvidenceId, SessionId } from './model/ids';

export {
  BRIDGE_ARTIFACT_MEDIA_TYPES,
  BRIDGE_ERROR_CODES,
  BRIDGE_HOST_NAME,
  BRIDGE_MAX_ARTIFACT_BYTES,
  BRIDGE_OPERATIONS,
  BRIDGE_PROTOCOL_VERSION,
  errorResponse,
  guessArtifactMediaType,
  isBridgeArtifactMediaType,
  isBridgeErrorCode,
  isBridgeOperation,
  isSafeArtifactName,
  isSafeArtifactSessionId,
  parseBridgeEnvelope,
  parseBridgePayload,
  parseBridgeResponse,
  readRequestId,
  successResponse,
  type BridgeArtifactMediaType,
  type BridgeArtifactReadPayload,
  type BridgeArtifactReadResult,
  type BridgeArtifactWritePayload,
  type BridgeArtifactWriteResult,
  type BridgeEnvelope,
  type BridgeError,
  type BridgeErrorCode,
  type BridgeErrorResponse,
  type BridgeHealthPayload,
  type BridgeHealthResult,
  type BridgeOperation,
  type BridgeParse,
  type BridgePayloadLimits,
  type BridgeResponse,
  type BridgeResult,
  type BridgeSuccessResponse,
  type ParsedBridgeEnvelope,
  type ValidatedBridgeArtifactWritePayload,
} from './bridge/protocol';

export {
  decodeBase64,
  encodeBase64,
  type Base64DecodeResult,
} from './bridge/base64';

export { DomainValidationError } from './model/errors';
export {
  assertHttpUrl,
  assertIsoTimestamp,
  assertNonBlank,
  assertPositiveInteger,
} from './model/invariants';

export {
  ATTACHMENT_KINDS,
  CONFIDENCE_LEVELS,
  createAttachment,
  createDomEvidence,
  createEvidence,
  type Attachment,
  type AttachmentKind,
  type AttachmentStorage,
  type Confidence,
  type CreateAttachmentInput,
  type CreateDomEvidenceInput,
  type CreateEvidenceInput,
  type DomAnchor,
  type DomEvidence,
  type Evidence,
  type EvidencePayload,
  type FrameworkEvidence,
  type Rect,
  type SourceMapEvidence,
  type Viewport,
  type VisualCaptureStatus,
  type VisualEvidence,
} from './model/evidence';

export {
  REDACTED_VALUE,
  isSensitiveAttributeName,
  redactAttributes,
  redactUrlSecrets,
  sanitizeDomAnchor,
} from './model/redaction';

export {
  COMMENT_CATEGORIES,
  COMMENT_PRIORITIES,
  DEFAULT_COMMENT_CATEGORY,
  DEFAULT_COMMENT_PRIORITY,
  assertCommentCategory,
  assertCommentPriority,
  createReviewComment,
  reviseReviewComment,
  type CommentCategory,
  type CommentPriority,
  type CreateReviewCommentInput,
  type ReviseReviewCommentInput,
  type ReviewComment,
} from './model/review-comment';

export {
  buildSessionName,
  createReviewSession,
  findCurrentSessionForPage,
  formatSessionTimestamp,
  isReviewablePageUrl,
  renameSession,
  sortSessionsByRecency,
  stopSession,
  type CreateReviewSessionInput,
  type ReviewSession,
  type SessionStatus,
} from './model/review-session';

export type { ActivePageInfo, ActivePagePort } from './ports/active-page';
export type { ClockPort } from './ports/clock';
export type { IdGeneratorPort } from './ports/id-generator';
export type {
  LocalArtifactContent,
  LocalBridgeArtifactRef,
  LocalBridgeArtifactWriteInput,
  LocalBridgeFailure,
  LocalBridgeFailureReason,
  LocalBridgeHealth,
  LocalBridgeHealthResult,
  LocalBridgePort,
  LocalBridgeReadResult,
  LocalBridgeWriteResult,
  StoredLocalArtifact,
} from './ports/local-bridge';
export type {
  ReviewSessionRepository,
  StorageDescriptor,
  StorageKind,
} from './ports/review-session-repository';
export type { RuntimeInfo, RuntimeInfoPort } from './ports/runtime-info';
export type {
  CapturedImage,
  ScreenshotCaptureOutcome,
  ScreenshotCapturePort,
  ScreenshotCaptureRequest,
} from './ports/screenshot-capture';

export {
  clearReviewSession,
  renameReviewSession,
  startReviewSession,
  stopReviewSession,
  type ClearReviewSessionDeps,
  type ClearReviewSessionResult,
  type RenameReviewSessionDeps,
  type RenameReviewSessionResult,
  type StartReviewSessionDeps,
  type StartReviewSessionResult,
  type StopReviewSessionDeps,
  type StopReviewSessionResult,
} from './usecases/session-lifecycle';

export {
  addReviewComment,
  deleteReviewComment,
  deleteReviewCommentAttachment,
  updateReviewComment,
  type AddReviewCommentDeps,
  type AddReviewCommentInput,
  type AddReviewCommentResult,
  type CommentValidationFailure,
  type DeleteReviewCommentAttachmentDeps,
  type DeleteReviewCommentAttachmentInput,
  type DeleteReviewCommentAttachmentResult,
  type DeleteReviewCommentDeps,
  type DeleteReviewCommentInput,
  type DeleteReviewCommentResult,
  type UpdateReviewCommentDeps,
  type UpdateReviewCommentInput,
  type UpdateReviewCommentResult,
} from './usecases/review-comments';

export {
  captureCommentEvidence,
  type CaptureCommentEvidenceDeps,
  type CaptureCommentEvidenceInput,
  type CaptureCommentEvidenceResult,
} from './usecases/capture-comment-evidence';

export {
  checkLocalBridge,
  readSessionArtifact,
  storeSessionArtifact,
  type CheckLocalBridgeDeps,
  type ReadSessionArtifactDeps,
  type StoreSessionArtifactDeps,
} from './usecases/local-bridge';

export {
  loadOverlayState,
  type LoadOverlayStateDeps,
  type LoadOverlayStateInput,
  type OverlayAnchor,
  type OverlayComment,
  type OverlayState,
} from './usecases/load-overlay-state';

export {
  loadReviewPanel,
  type ActivePageSummary,
  type AttachmentSummary,
  type CommentSummary,
  type LoadReviewPanelDeps,
  type LoadReviewPanelInput,
  type ReviewPanelState,
  type SessionSummary,
  type VisualEvidenceSummary,
} from './usecases/load-review-panel';
