import type { SessionId } from './ids';
import type { ReviewComment } from './review-comment';
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
