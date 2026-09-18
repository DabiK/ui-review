import type { Attachment, Evidence, Viewport } from './evidence';
import type { CommentId, SessionId } from './ids';
import { assertHttpUrl, assertIsoTimestamp, assertNonBlank, assertPositiveInteger } from './invariants';

export type CommentCategory =
  | 'UI'
  | 'UX'
  | 'Content'
  | 'Accessibility'
  | 'Performance'
  | 'Bug'
  | 'Other';

export const COMMENT_CATEGORIES = [
  'UI',
  'UX',
  'Content',
  'Accessibility',
  'Performance',
  'Bug',
  'Other',
] as const satisfies readonly CommentCategory[];

export type CommentPriority = 'critical' | 'important' | 'minor';

export const COMMENT_PRIORITIES = [
  'critical',
  'important',
  'minor',
] as const satisfies readonly CommentPriority[];

export const DEFAULT_COMMENT_CATEGORY: CommentCategory = 'UI';
export const DEFAULT_COMMENT_PRIORITY: CommentPriority = 'important';

/**
 * One durable review remark anchored to a page element. Comments are created through the
 * factory so callers never assemble invalid state.
 */
export interface ReviewComment {
  readonly id: CommentId;
  readonly sessionId: SessionId;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly pageUrl: string;
  readonly viewport: Viewport;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly Evidence[];
  readonly attachments: readonly Attachment[];
}

export interface CreateReviewCommentInput {
  readonly id: CommentId;
  readonly sessionId: SessionId;
  readonly text: string;
  readonly pageUrl: string;
  readonly viewport: Viewport;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly category?: CommentCategory;
  readonly priority?: CommentPriority;
  readonly evidence?: readonly Evidence[];
  readonly attachments?: readonly Attachment[];
}

export function createReviewComment(input: CreateReviewCommentInput): ReviewComment {
  const createdAt = assertIsoTimestamp(input.createdAt, 'createdAt');

  return {
    id: assertNonBlank(input.id, 'id'),
    sessionId: assertNonBlank(input.sessionId, 'sessionId'),
    text: assertNonBlank(input.text, 'text'),
    category: input.category ?? DEFAULT_COMMENT_CATEGORY,
    priority: input.priority ?? DEFAULT_COMMENT_PRIORITY,
    pageUrl: assertHttpUrl(input.pageUrl, 'pageUrl'),
    viewport: {
      width: assertPositiveInteger(input.viewport.width, 'viewport.width'),
      height: assertPositiveInteger(input.viewport.height, 'viewport.height'),
    },
    createdAt,
    updatedAt: assertIsoTimestamp(input.updatedAt ?? createdAt, 'updatedAt'),
    evidence: input.evidence ?? [],
    attachments: input.attachments ?? [],
  };
}
