import type { BridgeArtifactMediaType } from '../../../core/bridge/protocol';
import { buildArtifactRelativePaths } from '../../core/artifact-path';
import type {
  ArtifactStoreFailure,
  ArtifactStorePort,
  ArtifactWriteInput,
  StoredArtifactContent,
  StoredArtifactRecord,
} from '../../core/ports/artifact-store';

interface InMemoryRecord {
  readonly mediaType: BridgeArtifactMediaType;
  readonly content: Uint8Array;
}

export interface InMemoryArtifactStoreOptions {
  readonly root?: string;
}

/**
 * Portable artifact store used by tests and by the in-process bridge adapter. It shares the
 * path builder with the filesystem store, so traversal attempts fail identically, and it
 * copies bytes in and out instead of exposing live references.
 */
export class InMemoryArtifactStore implements ArtifactStorePort {
  readonly root: string;

  private readonly records = new Map<string, InMemoryRecord>();

  constructor(options: InMemoryArtifactStoreOptions = {}) {
    this.root = options.root ?? '/ui-review-memory';
  }

  async write(
    input: ArtifactWriteInput,
  ): Promise<{ readonly ok: true; readonly artifact: StoredArtifactRecord } | ArtifactStoreFailure> {
    const built = buildArtifactRelativePaths(input);
    if (!built.ok) {
      return { ok: false, code: built.code, message: built.message };
    }

    const content = new Uint8Array(input.content);
    this.records.set(built.paths.data, { mediaType: input.mediaType, content });

    return {
      ok: true,
      artifact: {
        sessionId: input.sessionId,
        name: input.name,
        path: this.absolute(built.paths.data),
        byteLength: content.byteLength,
      },
    };
  }

  async read(input: {
    readonly sessionId: string;
    readonly name: string;
  }): Promise<{ readonly ok: true; readonly artifact: StoredArtifactContent } | ArtifactStoreFailure> {
    const built = buildArtifactRelativePaths(input);
    if (!built.ok) {
      return { ok: false, code: built.code, message: built.message };
    }

    const record = this.records.get(built.paths.data);
    if (record === undefined) {
      return {
        ok: false,
        code: 'artifact-not-found',
        message: `No artifact named ${input.name} is stored for this session.`,
      };
    }

    return {
      ok: true,
      artifact: {
        sessionId: input.sessionId,
        name: input.name,
        path: this.absolute(built.paths.data),
        byteLength: record.content.byteLength,
        mediaType: record.mediaType,
        content: new Uint8Array(record.content),
      },
    };
  }

  private absolute(relativePath: string): string {
    return `${this.root.replace(/\/+$/, '')}/${relativePath}`;
  }
}
