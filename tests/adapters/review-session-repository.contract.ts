import { describe, expect, it } from 'vitest';
import { createReviewSession, type ReviewSession, type ReviewSessionRepository } from '@core';

const STARTED_AT = '2026-09-18T10:00:00.000Z';
const PAGE_URL = 'https://example.com/pricing?plan=team';

let sequence = 0;

function uniqueId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ReviewSessionRepositoryContractOptions {
  /**
   * Returns a fresh repository bound to an isolated store, so contract cases never share
   * state. The `testId` is unique per case.
   */
  readonly createRepository: (testId: string) => ReviewSessionRepository;
}

/**
 * Behaviour every `ReviewSessionRepository` implementation must provide. Run it against
 * each adapter so the in-memory double and the durable store cannot drift apart.
 */
export function describeReviewSessionRepositoryContract(
  options: ReviewSessionRepositoryContractOptions,
): void {
  const freshRepository = (): ReviewSessionRepository =>
    options.createRepository(uniqueId('store'));

  function makeSession(): ReviewSession {
    return createReviewSession({
      id: uniqueId('session'),
      name: 'example.com — 18 Sep 2026',
      pageUrl: PAGE_URL,
      startedAt: STARTED_AT,
    });
  }

  describe('ReviewSessionRepository contract', () => {
    it('describes its storage for the UI', async () => {
      const descriptor = freshRepository().describe();

      expect(descriptor.kind.length).toBeGreaterThan(0);
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(typeof descriptor.persistent).toBe('boolean');
    });

    it('round-trips a session by id', async () => {
      const repository = freshRepository();
      const session = makeSession();

      await repository.save(session);

      expect(await repository.findById(session.id)).toEqual(session);
    });

    it('returns null for an unknown session', async () => {
      expect(await freshRepository().findById('missing')).toBeNull();
    });

    it('upserts an existing session instead of duplicating it', async () => {
      const repository = freshRepository();
      const session = makeSession();

      await repository.save(session);
      await repository.save({ ...session, name: 'Renamed session' });

      const sessions = await repository.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.name).toBe('Renamed session');
    });

    it('lists every saved session', async () => {
      const repository = freshRepository();
      const first = makeSession();
      const second = makeSession();

      await repository.save(first);
      await repository.save(second);

      const ids = (await repository.list()).map((session) => session.id).sort();
      expect(ids).toEqual([first.id, second.id].sort());
    });

    it('deletes only the requested session', async () => {
      const repository = freshRepository();
      const kept = makeSession();
      const removed = makeSession();

      await repository.save(kept);
      await repository.save(removed);
      await repository.delete(removed.id);

      expect(await repository.findById(removed.id)).toBeNull();
      expect(await repository.findById(kept.id)).toEqual(kept);
    });

    it('ignores deletion of an unknown session', async () => {
      const repository = freshRepository();
      const session = makeSession();
      await repository.save(session);

      await repository.delete('missing');

      expect(await repository.list()).toEqual([session]);
    });

    it('never hands out live references to stored state', async () => {
      const repository = freshRepository();
      const session = makeSession();
      await repository.save(session);

      const loaded = await repository.findById(session.id);
      if (loaded === null) {
        throw new Error('expected the saved session to be found');
      }
      (loaded as { name: string }).name = 'mutated through a returned reference';
      (loaded.comments as unknown[]).push({});

      expect(await repository.findById(session.id)).toEqual(session);

      const listed = await repository.list();
      (listed as ReviewSession[]).pop();

      expect(await repository.list()).toHaveLength(1);
    });

    it('is not affected by caller mutations after save', async () => {
      const repository = freshRepository();
      const session = makeSession();
      await repository.save(session);

      (session as { name: string }).name = 'mutated after save';
      (session.comments as unknown[]).push({});

      expect(await repository.findById(session.id)).toEqual({
        ...session,
        name: 'example.com — 18 Sep 2026',
        comments: [],
      });
    });
  });
}
