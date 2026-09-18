import type { SessionId } from './ids';
import type { ReviewComment } from './review-comment';
import { DomainValidationError } from './errors';
import { assertHttpUrl, assertIsoTimestamp, assertNonBlank } from './invariants';

export type SessionStatus = 'active' | 'stopped';

/**
 * Aggregate root of a review: one page, one lifecycle, all of its comments.
 * Sessions are created through the factory so the name, URL and timestamps are valid from
 * the start; later lifecycle transitions belong to dedicated core use cases.
 */
export interface ReviewSession {
  readonly id: SessionId;
  readonly name: string;
  readonly status: SessionStatus;
  /** Missing on older records means annotation is enabled. Pause does not end the session. */
  readonly annotationPaused?: boolean;
  readonly pageUrl: string;
  readonly hostname: string;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly comments: readonly ReviewComment[];
}

export interface CreateReviewSessionInput {
  readonly id: SessionId;
  readonly name: string;
  readonly pageUrl: string;
  readonly startedAt: string;
  readonly comments?: readonly ReviewComment[];
}

export function createReviewSession(input: CreateReviewSessionInput): ReviewSession {
  const pageUrl = assertHttpUrl(input.pageUrl, 'pageUrl');

  return {
    id: assertNonBlank(input.id, 'id'),
    name: assertNonBlank(input.name, 'name'),
    status: 'active',
    pageUrl,
    hostname: new URL(pageUrl).hostname,
    startedAt: assertIsoTimestamp(input.startedAt, 'startedAt'),
    stoppedAt: null,
    comments: input.comments ?? [],
  };
}

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A page is reviewable only when the extension can inspect it, i.e. an http(s) URL. */
export function isReviewablePageUrl(value: string): boolean {
  try {
    assertHttpUrl(value, 'pageUrl');
    return true;
  } catch {
    return false;
  }
}

/** Deterministic UTC rendering of a session timestamp, e.g. `18 Sep 2026, 10:00`. */
export function formatSessionTimestamp(isoTimestamp: string): string {
  const timestamp = new Date(assertIsoTimestamp(isoTimestamp, 'timestamp'));
  const month = MONTH_ABBREVIATIONS[timestamp.getUTCMonth()] ?? 'Jan';
  const hours = String(timestamp.getUTCHours()).padStart(2, '0');
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, '0');

  return `${timestamp.getUTCDate()} ${month} ${timestamp.getUTCFullYear()}, ${hours}:${minutes}`;
}

/** Automatic session name made from the hostname and the UTC start timestamp. */
export function buildSessionName(hostname: string, startedAt: string): string {
  return `${assertNonBlank(hostname, 'hostname')} — ${formatSessionTimestamp(startedAt)}`;
}

/**
 * Lifecycle transition: an active session becomes stopped exactly once. The transition is
 * rejected when it would assemble an invalid aggregate.
 */
export function stopSession(session: ReviewSession, stoppedAt: string): ReviewSession {
  if (session.status === 'stopped') {
    throw new DomainValidationError('status', 'session is already stopped');
  }
  const timestamp = assertIsoTimestamp(stoppedAt, 'stoppedAt');
  if (Date.parse(timestamp) < Date.parse(session.startedAt)) {
    throw new DomainValidationError('stoppedAt', 'stoppedAt must not be before startedAt');
  }

  return { ...session, status: 'stopped', stoppedAt: timestamp };
}

/** Renames a session without touching its status, comments or timestamps. */
export function renameSession(session: ReviewSession, name: string): ReviewSession {
  return { ...session, name: assertNonBlank(name, 'name') };
}

/** Pauses page interception while preserving the active review and its evidence. */
export function setSessionPaused(session: ReviewSession, paused: boolean): ReviewSession {
  if (session.status !== 'active') {
    throw new DomainValidationError('status', 'a stopped review cannot be paused or resumed');
  }
  return { ...session, annotationPaused: paused };
}

/** Newest first, with a stable tie-breaker so list rendering is deterministic. */
export function sortSessionsByRecency(sessions: readonly ReviewSession[]): ReviewSession[] {
  return [...sessions].sort((left, right) => {
    const byStart = right.startedAt.localeCompare(left.startedAt);
    return byStart !== 0 ? byStart : right.id.localeCompare(left.id);
  });
}

/**
 * The session the side panel should show for a page: the active one when it exists,
 * otherwise the most recent stopped one.
 */
export function findCurrentSessionForPage(
  sessions: readonly ReviewSession[],
  pageUrl: string,
): ReviewSession | null {
  const pageSessions = sortSessionsByRecency(
    sessions.filter((session) => session.pageUrl === pageUrl),
  );

  return pageSessions.find((session) => session.status === 'active') ?? pageSessions[0] ?? null;
}
