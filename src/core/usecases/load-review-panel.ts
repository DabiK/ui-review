import type { SessionId } from '../model/ids';
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

export interface ReviewPanelState {
  readonly extensionName: string;
  readonly extensionVersion: string;
  readonly runtimeLabel: string;
  readonly storage: StorageDescriptor;
  /** The page the side panel is attached to, or `null` when no tab can be inspected. */
  readonly activePage: ActivePageSummary | null;
  /** Session shown for the active page: active when one exists, otherwise the latest stopped. */
  readonly currentSession: SessionSummary | null;
  /** Every stored session, newest first. */
  readonly sessions: readonly SessionSummary[];
}

export interface LoadReviewPanelDeps {
  readonly sessions: ReviewSessionRepository;
  readonly pages: ActivePagePort;
  readonly runtimeInfo: RuntimeInfoPort;
}

/**
 * Read model for the side-panel session lifecycle. It restores persisted sessions after a
 * reload and tells the UI whether the current page is eligible, without leaking adapter
 * internals.
 */
export async function loadReviewPanel(deps: LoadReviewPanelDeps): Promise<ReviewPanelState> {
  const [page, storedSessions, runtimeInfo] = await Promise.all([
    deps.pages.read(),
    deps.sessions.list(),
    deps.runtimeInfo.read(),
  ]);

  return {
    extensionName: runtimeInfo.extensionName,
    extensionVersion: runtimeInfo.extensionVersion,
    runtimeLabel: runtimeInfo.runtimeLabel,
    storage: deps.sessions.describe(),
    activePage: page === null ? null : toActivePageSummary(page),
    currentSession:
      page === null ? null : toSessionSummaryOrNull(findCurrentSessionForPage(storedSessions, page.url)),
    sessions: sortSessionsByRecency(storedSessions).map(toSessionSummary),
  };
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

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
