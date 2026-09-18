import { setSessionPaused, type ReviewSession } from '../model/review-session';
import type { ReviewSessionRepository } from '../ports/review-session-repository';
import type { ActivePagePort } from '../ports/active-page';

export type SetReviewPausedResult =
  | { readonly ok: true; readonly session: ReviewSession }
  | { readonly ok: false; readonly reason: 'session-not-found' | 'session-stopped' | 'page-mismatch' };

/** Pause is durable; resuming is allowed only on the review's original page. */
export async function setReviewPaused(
  deps: { readonly sessions: ReviewSessionRepository; readonly pages: ActivePagePort },
  input: { readonly sessionId: string; readonly paused: boolean },
): Promise<SetReviewPausedResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) return { ok: false, reason: 'session-not-found' };
  if (session.status !== 'active') return { ok: false, reason: 'session-stopped' };
  if (!input.paused && (await deps.pages.read())?.url !== session.pageUrl) {
    return { ok: false, reason: 'page-mismatch' };
  }
  const updated = setSessionPaused(session, input.paused);
  await deps.sessions.save(updated);
  return { ok: true, session: updated };
}
