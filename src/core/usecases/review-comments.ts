import { createDomEvidence, type DomAnchor, type Viewport } from '../model/evidence';
import { DomainValidationError } from '../model/errors';
import type { AttachmentId, CommentId, SessionId } from '../model/ids';
import {
  assertCommentCategory,
  assertCommentPriority,
  createReviewComment,
  reviseReviewComment,
  type CommentCategory,
  type CommentPriority,
  type ReviewComment,
} from '../model/review-comment';
import type { ClockPort } from '../ports/clock';
import type { IdGeneratorPort } from '../ports/id-generator';
import type { ReviewSessionRepository } from '../ports/review-session-repository';

/**
 * Comment use cases. All comment mutations of a session go through these functions so the
 * UI and the page overlay never assemble domain state nor write to the repository directly.
 * Expected failures are typed results; `DomainValidationError` is caught and translated for
 * the caller instead of leaking as an exception.
 */

export interface CommentValidationFailure {
  readonly field: string;
  readonly message: string;
}

export interface AddReviewCommentInput {
  readonly sessionId: SessionId;
  readonly text: string;
  readonly pageUrl: string;
  readonly viewport: Viewport;
  readonly category?: CommentCategory;
  readonly priority?: CommentPriority;
  readonly anchor?: DomAnchor;
}

export interface AddReviewCommentDeps {
  readonly sessions: ReviewSessionRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export type AddReviewCommentResult =
  | { readonly ok: true; readonly comment: ReviewComment }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'session-not-active'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'page-mismatch'; readonly expectedPageUrl: string }
  | ({
      readonly ok: false;
      readonly reason: 'invalid-comment';
    } & CommentValidationFailure);

/** Adds one durable comment to an active session, with its optional DOM anchor. */
export async function addReviewComment(
  deps: AddReviewCommentDeps,
  input: AddReviewCommentInput,
): Promise<AddReviewCommentResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }
  if (session.status !== 'active') {
    return { ok: false, reason: 'session-not-active', sessionId: input.sessionId };
  }
  if (session.pageUrl !== input.pageUrl) {
    return { ok: false, reason: 'page-mismatch', expectedPageUrl: session.pageUrl };
  }

  const capturedAt = deps.clock.now();
  const commentId = deps.ids.createId();

  let comment: ReviewComment;
  try {
    const evidence =
      input.anchor === undefined
        ? []
        : [
            createDomEvidence({
              id: deps.ids.createId(),
              commentId,
              capturedAt,
              anchor: input.anchor,
            }),
          ];

    comment = createReviewComment({
      id: commentId,
      sessionId: session.id,
      text: input.text,
      pageUrl: session.pageUrl,
      viewport: input.viewport,
      createdAt: capturedAt,
      evidence,
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
    });
  } catch (error) {
    const failure = toValidationFailure(error);
    if (failure === null) {
      throw error;
    }
    return { ok: false, reason: 'invalid-comment', ...failure };
  }

  await deps.sessions.save({ ...session, comments: [...session.comments, comment] });

  return { ok: true, comment };
}

export interface UpdateReviewCommentInput {
  readonly sessionId: SessionId;
  readonly commentId: CommentId;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
}

export interface UpdateReviewCommentDeps {
  readonly sessions: ReviewSessionRepository;
  readonly clock: ClockPort;
}

export type UpdateReviewCommentResult =
  | { readonly ok: true; readonly comment: ReviewComment }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'comment-not-found'; readonly commentId: CommentId }
  | ({
      readonly ok: false;
      readonly reason: 'invalid-comment';
    } & CommentValidationFailure);

/** Edits the text, category and priority of one stored comment. */
export async function updateReviewComment(
  deps: UpdateReviewCommentDeps,
  input: UpdateReviewCommentInput,
): Promise<UpdateReviewCommentResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }

  const existing = session.comments.find((comment) => comment.id === input.commentId);
  if (existing === undefined) {
    return { ok: false, reason: 'comment-not-found', commentId: input.commentId };
  }

  let revised: ReviewComment;
  try {
    revised = reviseReviewComment(existing, {
      text: input.text,
      category: assertCommentCategory(input.category),
      priority: assertCommentPriority(input.priority),
      updatedAt: deps.clock.now(),
    });
  } catch (error) {
    const failure = toValidationFailure(error);
    if (failure === null) {
      throw error;
    }
    return { ok: false, reason: 'invalid-comment', ...failure };
  }

  await deps.sessions.save({
    ...session,
    comments: session.comments.map((comment) =>
      comment.id === input.commentId ? revised : comment,
    ),
  });

  return { ok: true, comment: revised };
}

export interface DeleteReviewCommentAttachmentDeps {
  readonly sessions: ReviewSessionRepository;
}

export interface DeleteReviewCommentAttachmentInput {
  readonly sessionId: SessionId;
  readonly commentId: CommentId;
  readonly attachmentId: AttachmentId;
}

export type DeleteReviewCommentAttachmentResult =
  | { readonly ok: true; readonly comment: ReviewComment }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'comment-not-found'; readonly commentId: CommentId }
  | {
      readonly ok: false;
      readonly reason: 'attachment-not-found';
      readonly attachmentId: AttachmentId;
    };

/** Removes exactly one screenshot attachment, leaving the rest of the comment untouched. */
export async function deleteReviewCommentAttachment(
  deps: DeleteReviewCommentAttachmentDeps,
  input: DeleteReviewCommentAttachmentInput,
): Promise<DeleteReviewCommentAttachmentResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }

  const comment = session.comments.find((candidate) => candidate.id === input.commentId);
  if (comment === undefined) {
    return { ok: false, reason: 'comment-not-found', commentId: input.commentId };
  }
  if (!comment.attachments.some((attachment) => attachment.id === input.attachmentId)) {
    return { ok: false, reason: 'attachment-not-found', attachmentId: input.attachmentId };
  }

  const updated: ReviewComment = {
    ...comment,
    attachments: comment.attachments.filter(
      (attachment) => attachment.id !== input.attachmentId,
    ),
  };

  await deps.sessions.save({
    ...session,
    comments: session.comments.map((candidate) =>
      candidate.id === comment.id ? updated : candidate,
    ),
  });

  return { ok: true, comment: updated };
}

export interface DeleteReviewCommentDeps {
  readonly sessions: ReviewSessionRepository;
}

export interface DeleteReviewCommentInput {
  readonly sessionId: SessionId;
  readonly commentId: CommentId;
}

export type DeleteReviewCommentResult =
  | { readonly ok: true; readonly commentId: CommentId }
  | { readonly ok: false; readonly reason: 'session-not-found'; readonly sessionId: SessionId }
  | { readonly ok: false; readonly reason: 'comment-not-found'; readonly commentId: CommentId };

/** Removes exactly one comment, leaving the rest of the session untouched. */
export async function deleteReviewComment(
  deps: DeleteReviewCommentDeps,
  input: DeleteReviewCommentInput,
): Promise<DeleteReviewCommentResult> {
  const session = await deps.sessions.findById(input.sessionId);
  if (session === null) {
    return { ok: false, reason: 'session-not-found', sessionId: input.sessionId };
  }
  if (!session.comments.some((comment) => comment.id === input.commentId)) {
    return { ok: false, reason: 'comment-not-found', commentId: input.commentId };
  }

  await deps.sessions.save({
    ...session,
    comments: session.comments.filter((comment) => comment.id !== input.commentId),
  });

  return { ok: true, commentId: input.commentId };
}

function toValidationFailure(error: unknown): CommentValidationFailure | null {
  if (error instanceof DomainValidationError) {
    return { field: error.field, message: error.message };
  }
  return null;
}
