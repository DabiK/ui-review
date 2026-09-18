import type { DomEvidence, Rect, Viewport } from '../model/evidence';
import type { CommentId, SessionId } from '../model/ids';
import type {
  CommentCategory,
  CommentPriority,
  ReviewComment,
} from '../model/review-comment';
import type { ReviewSession } from '../model/review-session';
import type { ReviewSessionRepository } from '../ports/review-session-repository';

/** The anchor the page overlay needs to restore a pin, without the full evidence payload. */
export interface OverlayAnchor {
  readonly fingerprint: string;
  readonly ancestry: readonly string[];
  readonly text: string;
  readonly role: string | null;
  readonly boundingBox: Rect;
  readonly viewport: Viewport;
}

export interface OverlayComment {
  readonly id: CommentId;
  /** 1-based position used by both the page pins and the side-panel list. */
  readonly index: number;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly anchor: OverlayAnchor | null;
}

export interface OverlayState {
  readonly active: boolean;
  readonly sessionId: SessionId | null;
  readonly comments: readonly OverlayComment[];
}

export interface LoadOverlayStateDeps {
  readonly sessions: ReviewSessionRepository;
}

export interface LoadOverlayStateInput {
  readonly pageUrl: string;
}

/**
 * Read model for the page overlay: which session is running on this page and where its pins
 * belong. Nothing is injected when no session is explicitly active.
 */
export async function loadOverlayState(
  deps: LoadOverlayStateDeps,
  input: LoadOverlayStateInput,
): Promise<OverlayState> {
  const sessions = await deps.sessions.list();
  const active = findActiveSession(sessions, input.pageUrl);
  if (active === null) {
    return { active: false, sessionId: null, comments: [] };
  }

  return {
    active: true,
    sessionId: active.id,
    comments: active.comments.map((comment, position) => toOverlayComment(comment, position + 1)),
  };
}

function findActiveSession(
  sessions: readonly ReviewSession[],
  pageUrl: string,
): ReviewSession | null {
  return (
    sessions.find((session) => session.status === 'active' && session.annotationPaused !== true && session.pageUrl === pageUrl) ?? null
  );
}

function toOverlayComment(comment: ReviewComment, index: number): OverlayComment {
  const dom = findDomEvidence(comment);

  return {
    id: comment.id,
    index,
    text: comment.text,
    category: comment.category,
    priority: comment.priority,
    anchor:
      dom === null
        ? null
        : {
            fingerprint: dom.fingerprint,
            ancestry: dom.ancestry,
            text: dom.text,
            role: dom.role,
            boundingBox: dom.boundingBox,
            viewport: dom.viewport,
          },
  };
}

function findDomEvidence(comment: ReviewComment): DomEvidence | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type === 'dom') {
      return evidence.payload;
    }
  }
  return null;
}
