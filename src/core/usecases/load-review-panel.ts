import type { CommentId, SessionId } from '../model/ids';
import type { CommentCategory, CommentPriority, ReviewComment } from '../model/review-comment';
import {
  findCurrentSessionForPage,
  isReviewablePageUrl,
  sortSessionsByRecency,
  type ReviewSession,
  type SessionStatus,
} from '../model/review-session';
import type { ActivePageInfo, ActivePagePort } from '../ports/active-page';
import type { RuntimeInfoPort } from '../ports/runtime-info';
import type { ReviewSessionRepository, StorageDescriptor } from '../ports/review-session-repository';

export interface ActivePageSummary {
  readonly url: string;
  readonly title: string;
  readonly hostname: string;
  readonly eligible: boolean;
}

export interface SessionSummary {
  readonly id: SessionId;
  readonly name: string;
  readonly status: SessionStatus;
  readonly pageUrl: string;
  readonly hostname: string;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly commentCount: number;
}

export interface CommentSummary {
  readonly id: CommentId;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Short human label of the pinned element, when the comment carries a DOM anchor. */
  readonly anchorLabel: string | null;
}

export interface ReviewPanelState {
  readonly extensionName: string;
  readonly extensionVersion: string;
  readonly runtimeLabel: string;
  readonly storage: StorageDescriptor;
  /** The page the side panel is attached to, or `null` when no tab can be inspected. */
  readonly activePage: ActivePageSummary | null;
  /** Session shown for the active page: active when one exists, otherwise the latest stopped. */
  readonly currentSession: SessionSummary | null;
  /** Effective selection: the requested session when it still exists, otherwise a fallback. */
  readonly selectedSession: SessionSummary | null;
  /** Comments of the selected session, in creation order. */
  readonly comments: readonly CommentSummary[];
  /** Every stored session, newest first. */
  readonly sessions: readonly SessionSummary[];
}

export interface LoadReviewPanelDeps {
  readonly sessions: ReviewSessionRepository;
  readonly pages: ActivePagePort;
  readonly runtimeInfo: RuntimeInfoPort;
}

export interface LoadReviewPanelInput {
  readonly selectedSessionId?: SessionId;
}

const ANCHOR_LABEL_MAX_LENGTH = 60;

/**
 * Read model for the side-panel lifecycle and its comment list. It restores persisted
 * sessions after a reload, resolves the effective selection and tells the UI whether the
 * current page is eligible, without leaking adapter internals.
 */
export async function loadReviewPanel(
  deps: LoadReviewPanelDeps,
  input: LoadReviewPanelInput = {},
): Promise<ReviewPanelState> {
  const [page, storedSessions, runtimeInfo] = await Promise.all([
    deps.pages.read(),
    deps.sessions.list(),
    deps.runtimeInfo.read(),
  ]);

  const sorted = sortSessionsByRecency(storedSessions);
  const currentSession =
    page === null ? null : findCurrentSessionForPage(storedSessions, page.url);
  const selectedSession = resolveSelectedSession(sorted, currentSession, input.selectedSessionId);

  return {
    extensionName: runtimeInfo.extensionName,
    extensionVersion: runtimeInfo.extensionVersion,
    runtimeLabel: runtimeInfo.runtimeLabel,
    storage: deps.sessions.describe(),
    activePage: page === null ? null : toActivePageSummary(page),
    currentSession: toSessionSummaryOrNull(currentSession),
    selectedSession: toSessionSummaryOrNull(selectedSession),
    comments: selectedSession === null ? [] : selectedSession.comments.map(toCommentSummary),
    sessions: sorted.map(toSessionSummary),
  };
}

function resolveSelectedSession(
  sortedSessions: readonly ReviewSession[],
  currentSession: ReviewSession | null,
  requestedId: SessionId | undefined,
): ReviewSession | null {
  if (requestedId !== undefined) {
    const requested = sortedSessions.find((session) => session.id === requestedId);
    if (requested !== undefined) {
      return requested;
    }
  }
  return currentSession ?? sortedSessions[0] ?? null;
}

function toActivePageSummary(page: ActivePageInfo): ActivePageSummary {
  return {
    url: page.url,
    title: page.title,
    hostname: safeHostname(page.url),
    eligible: isReviewablePageUrl(page.url),
  };
}

function toSessionSummary(session: ReviewSession): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    pageUrl: session.pageUrl,
    hostname: session.hostname,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    commentCount: session.comments.length,
  };
}

function toSessionSummaryOrNull(session: ReviewSession | null): SessionSummary | null {
  return session === null ? null : toSessionSummary(session);
}

function toCommentSummary(comment: ReviewComment): CommentSummary {
  return {
    id: comment.id,
    text: comment.text,
    category: comment.category,
    priority: comment.priority,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    anchorLabel: anchorLabel(comment),
  };
}

function anchorLabel(comment: ReviewComment): string | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type !== 'dom') {
      continue;
    }
    const text = evidence.payload.text.trim().replaceAll(/\s+/g, ' ');
    if (text.length > 0) {
      return truncate(text, ANCHOR_LABEL_MAX_LENGTH);
    }
    return evidence.payload.role ?? evidence.payload.fingerprint;
  }
  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
