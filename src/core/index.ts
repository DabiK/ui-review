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
  type BridgeHandoffFilePayload,
  type BridgeHandoffFileResult,
  type BridgeHandoffMaterializePayload,
  type BridgeHandoffMaterializeResult,
  type BridgeOperation,
  type BridgeParse,
  type BridgePayloadLimits,
  type BridgeResponse,
  type BridgeResult,
  type BridgeSuccessResponse,
  type ParsedBridgeEnvelope,
  type ValidatedBridgeArtifactWritePayload,
  type ValidatedBridgeHandoffFile,
  type ValidatedBridgeHandoffMaterializePayload,
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
  createFrameworkEvidence,
  createSourceMapEvidence,
  unavailableFrameworkObservation,
  unavailableSourceMapObservation,
  type Attachment,
  type AttachmentKind,
  type AttachmentStorage,
  type Confidence,
  type CreateAttachmentInput,
  type CreateDomEvidenceInput,
  type CreateEvidenceInput,
  type CreateFrameworkEvidenceInput,
  type CreateSourceMapEvidenceInput,
  type DomAnchor,
  type DomEvidence,
  type Evidence,
  type EvidencePayload,
  type FrameworkEvidence,
  type FrameworkKind,
  type FrameworkObservation,
  type Rect,
  type SourceMapEvidence,
  type SourceMapObservation,
  type SourceReference,
  type Viewport,
  type VisualCaptureStatus,
  type VisualEvidence,
} from './model/evidence';

export {
  decodeInlineSourceMap,
  findSourceMappingUrl,
  parseSourceMapDocument,
  resolveSourceMapPosition,
  type ResolvedSourcePosition,
  type SourceMapDocument,
} from './source-maps/source-map-resolver';

export { isDirectSourceReference } from './source-maps/source-reference';

export {
  REDACTED_VALUE,
  isSensitiveAttributeName,
  redactAttributes,
  redactUrlSecrets,
  sanitizeDomAnchor,
} from './model/redaction';

export {
  REVIEW_BRIEF_IMAGE_MEDIA_TYPES,
  REVIEW_BRIEF_JSON_FILE,
  REVIEW_BRIEF_MARKDOWN_FILE,
  REVIEW_BRIEF_MAX_FILES,
  REVIEW_BRIEF_MAX_FILE_BYTES,
  REVIEW_BRIEF_MAX_TOTAL_BYTES,
  REVIEW_BRIEF_SCHEMA_VERSION,
  buildReviewBrief,
  collectReviewBriefFileNames,
  isReviewBriefImageMediaType,
  parseReviewBriefDocument,
  renderReviewBriefMarkdown,
  type BuildReviewBriefOptions,
  type ReviewBriefAttachment,
  type ReviewBriefBundle,
  type ReviewBriefComment,
  type ReviewBriefDocument,
  type ReviewBriefDomEvidence,
  type ReviewBriefEvidence,
  type ReviewBriefFile,
  type ReviewBriefFrameworkEvidence,
  type ReviewBriefImageMediaType,
  type ReviewBriefParseResult,
  type ReviewBriefPaths,
  type ReviewBriefSession,
  type ReviewBriefSourceMapEvidence,
  type ReviewBriefVisualEvidence,
} from './handoff/review-brief';

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
  setSessionPaused,
  type CreateReviewSessionInput,
  type ReviewSession,
  type SessionStatus,
} from './model/review-session';

export type { ActivePageInfo, ActivePagePort } from './ports/active-page';
export type { ClipboardPort, ClipboardWriteResult } from './ports/clipboard';
export type { ClockPort } from './ports/clock';
export type {
  ComponentContextPort,
  ComponentContextRequest,
} from './ports/component-context';
export type { IdGeneratorPort } from './ports/id-generator';
export type {
  LocalArtifactContent,
  LocalBridgeArtifactRef,
  LocalBridgeArtifactWriteInput,
  LocalBridgeFailure,
  LocalBridgeFailureReason,
  LocalBridgeHandoff,
  LocalBridgeHandoffFile,
  LocalBridgeHandoffFileResult,
  LocalBridgeHandoffInput,
  LocalBridgeHandoffResult,
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
export type {
  SourceMapContextPort,
  SourceMapContextRequest,
  SourceMapResolution,
} from './ports/source-map-context';

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
export { setReviewPaused, type SetReviewPausedResult } from './usecases/set-review-paused';

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
  type CommentEvidenceCaptureRequest,
} from './usecases/capture-comment-evidence';

export {
  checkLocalBridge,
  materializeReviewHandoff,
  readSessionArtifact,
  storeSessionArtifact,
  type CheckLocalBridgeDeps,
  type MaterializeReviewHandoffDeps,
  type ReadSessionArtifactDeps,
  type StoreSessionArtifactDeps,
} from './usecases/local-bridge';

export {
  BRIDGE_INCOMPATIBLE_MESSAGE,
  BRIDGE_MISSING_MESSAGE,
  loadBridgeSetup,
  type BridgeSetup,
  type LoadBridgeSetupDeps,
} from './usecases/load-bridge-setup';

export {
  loadOverlayState,
  type LoadOverlayStateDeps,
  type LoadOverlayStateInput,
  type OverlayAnchor,
  type OverlayComment,
  type OverlayState,
} from './usecases/load-overlay-state';

export {
  exportReviewHandoff,
  type ExportReviewHandoffDeps,
  type ExportReviewHandoffFailure,
  type ExportReviewHandoffFailureReason,
  type ExportReviewHandoffInput,
  type ExportReviewHandoffResult,
} from './usecases/export-review-handoff';

export {
  loadReviewPanel,
  type ActivePageSummary,
  type AttachmentSummary,
  type CommentSummary,
  type FrameworkEvidenceSummary,
  type LoadReviewPanelDeps,
  type LoadReviewPanelInput,
  type ReviewPanelState,
  type SessionSummary,
  type SourceMapEvidenceSummary,
  type VisualEvidenceSummary,
} from './usecases/load-review-panel';
