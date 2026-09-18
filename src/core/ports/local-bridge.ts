import type { BridgeArtifactMediaType, BridgeErrorCode } from '../bridge/protocol';
import type { SessionId } from '../model/ids';

/**
 * Driven port: the local native bridge, seen from the domain. The UI and the core never
 * know about Native Messaging, process spawning or filesystem paths; they only ask for a
 * health check and durable artifact storage. Expected failures are typed values, never
 * thrown errors, so a missing or broken bridge is a state the product can present.
 */

export interface LocalBridgeHealth {
  readonly status: 'ok';
  readonly bridgeVersion: string;
  readonly platform: string;
  /** Durable OS application-data root where the bridge stores session artifacts. */
  readonly artifactRoot: string;
}

export interface LocalBridgeArtifactWriteInput {
  readonly sessionId: SessionId;
  readonly name: string;
  readonly mediaType: BridgeArtifactMediaType;
  readonly content: Uint8Array;
}

export interface LocalBridgeArtifactRef {
  readonly sessionId: SessionId;
  readonly name: string;
}

export interface StoredLocalArtifact {
  readonly sessionId: SessionId;
  readonly name: string;
  /** Absolute local path of the persisted artifact, meant for the agent brief. */
  readonly path: string;
  readonly byteLength: number;
}

export interface LocalArtifactContent extends StoredLocalArtifact {
  readonly mediaType: BridgeArtifactMediaType;
  readonly content: Uint8Array;
}

export const LOCAL_BRIDGE_FAILURE_REASONS = [
  'bridge-unavailable',
  'bridge-rejected',
  'invalid-response',
  'artifact-not-found',
  'invalid-session-id',
  'invalid-artifact-name',
  'unsupported-media-type',
  'artifact-too-large',
  'empty-artifact',
] as const;
export type LocalBridgeFailureReason = (typeof LOCAL_BRIDGE_FAILURE_REASONS)[number];

export interface LocalBridgeFailure {
  readonly ok: false;
  readonly reason: LocalBridgeFailureReason;
  /** Human-readable explanation the UI can show without inspecting adapter internals. */
  readonly message: string;
  /** Bridge protocol error when the bridge answered; `null` for transport or local failures. */
  readonly code: BridgeErrorCode | null;
}

export type LocalBridgeHealthResult =
  | { readonly ok: true; readonly health: LocalBridgeHealth }
  | LocalBridgeFailure;

export type LocalBridgeWriteResult =
  | { readonly ok: true; readonly artifact: StoredLocalArtifact }
  | LocalBridgeFailure;

export type LocalBridgeReadResult =
  | { readonly ok: true; readonly artifact: LocalArtifactContent }
  | LocalBridgeFailure;

export interface LocalBridgePort {
  /** Round-trips a versioned health check through the bridge. */
  checkHealth(): Promise<LocalBridgeHealthResult>;
  /** Persists one artifact under the bridge's per-session storage root. */
  writeArtifact(input: LocalBridgeArtifactWriteInput): Promise<LocalBridgeWriteResult>;
  /** Reads back one artifact previously persisted for the session. */
  readArtifact(input: LocalBridgeArtifactRef): Promise<LocalBridgeReadResult>;
}
