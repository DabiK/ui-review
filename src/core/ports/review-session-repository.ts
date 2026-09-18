import type { SessionId } from '../model/ids';
import type { ReviewSession } from '../model/review-session';

/**
 * How and where sessions are stored. Exposed by the repository port so the UI can be honest
 * about persistence without knowing adapter internals.
 */
export type StorageKind = 'indexeddb' | 'in-memory' | 'native-artifacts';

export interface StorageDescriptor {
  readonly kind: StorageKind;
  readonly persistent: boolean;
  readonly label: string;
}

/**
 * Driven port: durable storage for the `ReviewSession` aggregate.
 * Two implementations exist from day one — IndexedDB (production) and in-memory (tests).
 */
export interface ReviewSessionRepository {
  describe(): StorageDescriptor;
  save(session: ReviewSession): Promise<void>;
  findById(id: SessionId): Promise<ReviewSession | null>;
  list(): Promise<readonly ReviewSession[]>;
  delete(id: SessionId): Promise<void>;
}
