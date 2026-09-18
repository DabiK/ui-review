import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { describeReviewSessionRepositoryContract } from './review-session-repository.contract';

describeReviewSessionRepositoryContract({
  createRepository: (testId) =>
    new IndexedDbReviewSessionRepository({ databaseName: `ui-review-${testId}` }),
});

describe('IndexedDbReviewSessionRepository', () => {
  it('declares durable storage', () => {
    expect(
      new IndexedDbReviewSessionRepository({ databaseName: 'ui-review-describe' }).describe(),
    ).toEqual({
      kind: 'indexeddb',
      persistent: true,
      label: 'IndexedDB (this browser profile)',
    });
  });

  it('isolates stores by database name', async () => {
    const first = new IndexedDbReviewSessionRepository({ databaseName: 'ui-review-isolated-a' });
    const second = new IndexedDbReviewSessionRepository({ databaseName: 'ui-review-isolated-b' });

    expect(await first.list()).toEqual([]);
    expect(await second.list()).toEqual([]);
  });
});
