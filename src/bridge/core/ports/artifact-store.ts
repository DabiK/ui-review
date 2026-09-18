import type { BridgeArtifactMediaType, BridgeErrorCode } from '../../../core/bridge/protocol';

/**
 * Driven port of the native bridge: durable artifact storage under an OS application-data
 * root. The bridge core decides what a session artifact is (safe path segments, metadata);
 * the adapter only knows how to persist bytes. Expected failures are typed values.
 */

export type ArtifactStoreErrorCode = Extract<
  BridgeErrorCode,
  | 'invalid-session-id'
  | 'invalid-artifact-name'
  | 'path-not-allowed'
  | 'artifact-not-found'
  | 'io-error'
>;

export interface ArtifactStoreFailure {
  readonly ok: false;
  readonly code: ArtifactStoreErrorCode;
  readonly message: string;
}

export interface ArtifactWriteInput {
  readonly sessionId: string;
  readonly name: string;
  readonly mediaType: BridgeArtifactMediaType;
  readonly content: Uint8Array;
}

export interface StoredArtifactRecord {
  readonly sessionId: string;
  readonly name: string;
  /** Absolute local path of the persisted artifact. */
  readonly path: string;
  readonly byteLength: number;
}

export interface StoredArtifactContent extends StoredArtifactRecord {
  readonly mediaType: BridgeArtifactMediaType;
  readonly content: Uint8Array;
}

export interface ArtifactStorePort {
  /** Absolute root every artifact path is contained in. */
  readonly root: string;
  write(
    input: ArtifactWriteInput,
  ): Promise<{ readonly ok: true; readonly artifact: StoredArtifactRecord } | ArtifactStoreFailure>;
  read(input: {
    readonly sessionId: string;
    readonly name: string;
  }): Promise<{ readonly ok: true; readonly artifact: StoredArtifactContent } | ArtifactStoreFailure>;
}
