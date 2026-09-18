import type { SessionId } from '../model/ids';
import {
  buildSessionName,
  createReviewSession,
  findCurrentSessionForPage,
  isReviewablePageUrl,
  renameSession,
  stopSession,
  type ReviewSession,
} from '../model/review-session';
import type { ActivePagePort } from '../ports/active-page';
import type { ClockPort } from '../ports/clock';
import type { IdGeneratorPort } from '../ports/id-generator';
import type { ReviewSessionRepository } from '../ports/review-session-repository';

/**
 * Session lifecycle use cases. Every state transition of the `ReviewSession` aggregate goes
 * through one of these functions: the UI never mutates persistence and never assembles a
 * session by itself. Expected failures are returned as typed results, not thrown.
 */

export interface StartReviewSessionDeps {
  readonly sessions: ReviewSessionRepository;
  readonly pages: ActivePagePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export type StartReviewSessionResult =
  | { readonly ok: true; readonly session: ReviewSession }
  | { readonly ok: false; readonly reason: 'no-active-page' }
  | { readonly ok: false; readonly reason: 'ineligible-page'; readonly pageUrl: string }
  | {
      readonly ok: false;
      readonly reason: 'session-already-active';
      readonly session: ReviewSession;
    };

/**
 * Starts an explicit review for the current page. Nothing is captured until this use case
 * is called: the side panel only renders a button.
 */
export async function startReviewSession(
  deps: StartReviewSessionDeps,
): Promise<StartReviewSessionResult> {
  const page = await deps.pages.read();
  if (page === null) {
    return { ok: false, reason: 'no-active-page' };
  }
  if (!isReviewablePageUrl(page.url)) {
    return { ok: false, reason: 'ineligible-page', pageUrl: page.url };
  }

  const existing = findCurrentSessionForPage(await deps.sessions.list(), page.url);
  if (existing !== null && existing.status === 'active') {
    return { ok: false, reason: 'session-already-active', session: existing };
  }

  const startedAt = deps.clock.now();
  const session = createReviewSession({
    id: deps.ids.createId(),
    name: buildSessionName(new URL(page.url).hostname, startedAt),
    pageUrl: page.url,
    startedAt,
  });
  await deps.sessions.save(session);

  return { ok: true, session };
}

export interface StopReviewSessionDeps {
  readonly sessions: ReviewSessionRepository;
  readonly clock: ClockPort;
}

export type StopReviewSessionResult =
  | { readonly ok: true; readonly session: ReviewSession }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'session-already-stopped'; readonly session: ReviewSession }
  | { readonly ok: false; readonly reason: 'clock-before-start'; readonly session: ReviewSession };

/** Stops an active session; its stored comments stay untouched. */
export async function stopReviewSession(
  deps: StopReviewSessionDeps,
  input: { readonly sessionId: SessionId },
): Promise<StopReviewSessionResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }
  if (session.status === 'stopped') {
    return { ok: false, reason: 'session-already-stopped', session };
  }

  const stoppedAt = deps.clock.now();
  if (Date.parse(stoppedAt) < Date.parse(session.startedAt)) {
    return { ok: false, reason: 'clock-before-start', session };
  }

  const stopped = stopSession(session, stoppedAt);
  await deps.sessions.save(stopped);

  return { ok: true, session: stopped };
}

export interface RenameReviewSessionDeps {
  readonly sessions: ReviewSessionRepository;
}

export type RenameReviewSessionResult =
  | { readonly ok: true; readonly session: ReviewSession }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'invalid-name' };

/** Renames a session; the name is trimmed and must not be blank. */
export async function renameReviewSession(
  deps: RenameReviewSessionDeps,
  input: { readonly sessionId: SessionId; readonly name: string },
): Promise<RenameReviewSessionResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }

  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, reason: 'invalid-name' };
  }

  const renamed = renameSession(session, name);
  await deps.sessions.save(renamed);

  return { ok: true, session: renamed };
}

export interface ClearReviewSessionDeps {
  readonly sessions: ReviewSessionRepository;
}

export type ClearReviewSessionResult =
  | { readonly ok: true; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId };

/**
 * Deletes one session and the core records it owns (comments, evidence and attachments are
 * embedded in the aggregate). Other sessions are left intact.
 */
export async function clearReviewSession(
  deps: ClearReviewSessionDeps,
  input: { readonly sessionId: SessionId },
): Promise<ClearReviewSessionResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }

  await deps.sessions.delete(input.sessionId);

  return { ok: true, sessionId: input.sessionId };
}
