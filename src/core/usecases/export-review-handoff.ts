import { DomainValidationError } from '../model/errors';
import type { BridgeErrorCode } from '../bridge/protocol';
import { buildReviewBrief } from '../handoff/review-brief';
import type { SessionId } from '../model/ids';
import type { ClockPort } from '../ports/clock';
import type { ClipboardPort } from '../ports/clipboard';
import type {
  LocalBridgeFailureReason,
  LocalBridgeHandoff,
} from '../ports/local-bridge';
import type { ReviewSessionRepository } from '../ports/review-session-repository';
import { materializeReviewHandoff } from './local-bridge';

/**
 * Core use case: turn a persisted review into one agent-ready handoff. It builds the
 * versioned brief from the session, asks the local bridge to materialize `review.md`,
 * `review.json` and the screenshots into the per-session temporary directory, then copies
 * the exact Markdown the bridge wrote. Every expected failure is a typed result; the
 * persisted session is never modified, so a failed export loses nothing.
 */

export interface ExportReviewHandoffDeps {
  readonly sessions: ReviewSessionRepository;
  readonly bridge: Parameters<typeof materializeReviewHandoff>[0]['bridge'];
  readonly clipboard: ClipboardPort;
  readonly clock: ClockPort;
}

export interface ExportReviewHandoffInput {
  readonly sessionId: SessionId;
}

export type ExportReviewHandoffFailureReason =
  | 'session-not-found'
  | 'no-comments'
  | 'invalid-session'
  | 'clipboard-unavailable'
  | LocalBridgeFailureReason;

export interface ExportReviewHandoffFailure {
  readonly ok: false;
  readonly reason: ExportReviewHandoffFailureReason;
  readonly message: string;
  readonly code: BridgeErrorCode | null;
}

export type ExportReviewHandoffResult =
  | { readonly ok: true; readonly handoff: LocalBridgeHandoff }
  | ExportReviewHandoffFailure;

export async function exportReviewHandoff(
  deps: ExportReviewHandoffDeps,
  input: ExportReviewHandoffInput,
): Promise<ExportReviewHandoffResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return failure('session-not-found', 'That review session no longer exists.');
  }
  if (session.comments.length === 0) {
    return failure('no-comments', 'Add at least one note before copying an agent brief.');
  }

  let bundle: ReturnType<typeof buildReviewBrief>;
  try {
    bundle = buildReviewBrief(session, { generatedAt: deps.clock.now() });
  } catch (error) {
    return failure(
      'invalid-session',
      error instanceof DomainValidationError
        ? `The review session cannot be exported: ${error.message}.`
        : 'The review session cannot be exported.',
    );
  }

  const materialized = await materializeReviewHandoff(
    { bridge: deps.bridge },
    {
      sessionId: session.id,
      brief: bundle.brief,
      files: bundle.files,
    },
  );
  if (!materialized.ok) {
    return materialized;
  }

  const copied = await deps.clipboard.writeText(materialized.handoff.markdown);
  if (!copied.ok) {
    return failure('clipboard-unavailable', copied.message);
  }

  return { ok: true, handoff: materialized.handoff };
}

function failure(reason: ExportReviewHandoffFailureReason, message: string): ExportReviewHandoffFailure {
  return { ok: false, reason, message, code: null };
}
