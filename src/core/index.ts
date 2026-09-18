/**
 * Public surface of the `review-core` domain module.
 *
 * Everything outside the core (adapters, application wiring, UI, tests) must import from
 * this barrel only. Dependencies point inward: nothing in here may import Chrome, DOM,
 * framework, Node or adapter code.
 */
export type { AttachmentId, CommentId, EvidenceId, SessionId } from './model/ids';

export { DomainValidationError } from './model/errors';
export {
  assertHttpUrl,
  assertIsoTimestamp,
  assertNonBlank,
  assertPositiveInteger,
} from './model/invariants';

export {
  CONFIDENCE_LEVELS,
  type Attachment,
  type AttachmentKind,
  type AttachmentStorage,
  type Confidence,
  type DomEvidence,
  type Evidence,
  type EvidencePayload,
  type FrameworkEvidence,
  type Rect,
  type SourceMapEvidence,
  type Viewport,
} from './model/evidence';

export {
  COMMENT_CATEGORIES,
  COMMENT_PRIORITIES,
  DEFAULT_COMMENT_CATEGORY,
  DEFAULT_COMMENT_PRIORITY,
  createReviewComment,
  type CommentCategory,
  type CommentPriority,
  type CreateReviewCommentInput,
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
  ReviewSessionRepository,
  StorageDescriptor,
  StorageKind,
} from './ports/review-session-repository';
export type { RuntimeInfo, RuntimeInfoPort } from './ports/runtime-info';

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
  loadReviewPanel,
  type ActivePageSummary,
  type LoadReviewPanelDeps,
  type ReviewPanelState,
  type SessionSummary,
} from './usecases/load-review-panel';
