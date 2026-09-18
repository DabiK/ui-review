import type {
  ReviewSession,
  ReviewSessionRepository,
  SessionId,
  StorageDescriptor,
} from '@core';

const DEFAULT_DATABASE_NAME = 'ui-review';
const DEFAULT_STORE_NAME = 'review-sessions';
const DATABASE_VERSION = 1;

export interface IndexedDbReviewSessionRepositoryOptions {
  readonly databaseName?: string;
  readonly storeName?: string;
  /** Injection seam for tests (fake-indexeddb) and for non-browser hosts. */
  readonly indexedDB?: IDBFactory;
}

/**
 * Production repository: durable local storage in the browser profile.
 * The schema is intentionally a plain object store keyed by session id; the core aggregate
 * is stored as-is and never leaks adapter types.
 */
export class IndexedDbReviewSessionRepository implements ReviewSessionRepository {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly factory: IDBFactory | undefined;
  private database: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbReviewSessionRepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.factory = options.indexedDB;
  }

  describe(): StorageDescriptor {
    return {
      kind: 'indexeddb',
      persistent: true,
      label: 'IndexedDB (this browser profile)',
    };
  }

  async save(session: ReviewSession): Promise<void> {
    await this.withStore('readwrite', (store) => store.put(session));
  }

  async findById(id: SessionId): Promise<ReviewSession | null> {
    const session = await this.withStore<ReviewSession | undefined>('readonly', (store) =>
      store.get(id),
    );
    return session ?? null;
  }

  async list(): Promise<readonly ReviewSession[]> {
    return this.withStore<ReviewSession[]>('readonly', (store) => store.getAll());
  }

  async delete(id: SessionId): Promise<void> {
    await this.withStore('readwrite', (store) => store.delete(id));
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.open();
    const transaction = database.transaction(this.storeName, mode);
    const completed = transactionToPromise(transaction);

    try {
      const result = await requestToPromise(action(transaction.objectStore(this.storeName)));
      await completed;
      return result;
    } catch (error) {
      await completed.catch(() => undefined);
      throw error;
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.database === null) {
      this.database = this.openDatabase().catch((error: unknown) => {
        this.database = null;
        throw error;
      });
    }
    return this.database;
  }

  private openDatabase(): Promise<IDBDatabase> {
    const factory = this.factory ?? globalThis.indexedDB;
    if (factory === undefined) {
      return Promise.reject(new Error('IndexedDB is not available in this environment'));
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(this.databaseName, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to open the IndexedDB database'));
    });
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
