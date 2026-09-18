import type {
  ReviewSession,
  ReviewSessionRepository,
  SessionId,
  StorageDescriptor,
} from '@core';

/**
 * Test double that is also a real, complete implementation of the port: it is used by the
 * repository contract tests and by anything that needs an ephemeral workspace.
 * All data is cloned on the way in and out, exactly like a durable store would.
 */
export class InMemoryReviewSessionRepository implements ReviewSessionRepository {
  private readonly sessions = new Map<SessionId, ReviewSession>();

  describe(): StorageDescriptor {
    return {
      kind: 'in-memory',
      persistent: false,
      label: 'In-memory (ephemeral)',
    };
  }

  async save(session: ReviewSession): Promise<void> {
    this.sessions.set(session.id, clone(session));
  }

  async findById(id: SessionId): Promise<ReviewSession | null> {
    const session = this.sessions.get(id);
    return session === undefined ? null : clone(session);
  }

  async list(): Promise<readonly ReviewSession[]> {
    return [...this.sessions.values()].map(clone);
  }

  async delete(id: SessionId): Promise<void> {
    this.sessions.delete(id);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
