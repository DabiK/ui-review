import { describe, expect, it } from 'vitest';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { describeReviewSessionRepositoryContract } from './review-session-repository.contract';

describeReviewSessionRepositoryContract({
  createRepository: () => new InMemoryReviewSessionRepository(),
});

describe('InMemoryReviewSessionRepository', () => {
  it('declares ephemeral storage', () => {
    expect(new InMemoryReviewSessionRepository().describe()).toEqual({
      kind: 'in-memory',
      persistent: false,
      label: 'In-memory (ephemeral)',
    });
  });
});
