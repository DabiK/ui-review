import {
  BRIDGE_ARTIFACT_MEDIA_TYPES,
  BRIDGE_MAX_ARTIFACT_BYTES,
  isBridgeArtifactMediaType,
  isSafeArtifactName,
  isSafeArtifactSessionId,
} from '../bridge/protocol';
import type {
  LocalBridgeArtifactRef,
  LocalBridgeArtifactWriteInput,
  LocalBridgeFailure,
  LocalBridgeHealthResult,
  LocalBridgePort,
  LocalBridgeReadResult,
  LocalBridgeWriteResult,
} from '../ports/local-bridge';

/**
 * Core use cases for the local bridge. They own the input validation (safe path segments,
 * allowlisted media types, size bounds) so every caller — the panel, the service worker or a
 * future export flow — gets the same guarantees without knowing the wire protocol.
 */

export interface CheckLocalBridgeDeps {
  readonly bridge: LocalBridgePort;
}

export interface StoreSessionArtifactDeps {
  readonly bridge: LocalBridgePort;
}

export interface ReadSessionArtifactDeps {
  readonly bridge: LocalBridgePort;
}

const TRANSPORT_FAILURE_MESSAGE = 'The local bridge could not be reached.';

export async function checkLocalBridge(
  deps: CheckLocalBridgeDeps,
): Promise<LocalBridgeHealthResult> {
  try {
    return await deps.bridge.checkHealth();
  } catch {
    return transportFailure();
  }
}

export async function storeSessionArtifact(
  deps: StoreSessionArtifactDeps,
  input: LocalBridgeArtifactWriteInput,
): Promise<LocalBridgeWriteResult> {
  const invalid = validateWriteInput(input);
  if (invalid !== null) {
    return invalid;
  }
  try {
    return await deps.bridge.writeArtifact(input);
  } catch {
    return transportFailure();
  }
}

export async function readSessionArtifact(
  deps: ReadSessionArtifactDeps,
  input: LocalBridgeArtifactRef,
): Promise<LocalBridgeReadResult> {
  const invalid = validateRef(input);
  if (invalid !== null) {
    return invalid;
  }
  try {
    return await deps.bridge.readArtifact(input);
  } catch {
    return transportFailure();
  }
}

function validateWriteInput(input: LocalBridgeArtifactWriteInput): LocalBridgeFailure | null {
  const invalidRef = validateRef(input);
  if (invalidRef !== null) {
    return invalidRef;
  }
  if (!isBridgeArtifactMediaType(input.mediaType) || !isAllowedMediaType(input.mediaType)) {
    return failure(
      'unsupported-media-type',
      'The artifact media type is not supported by the local bridge.',
    );
  }
  if (input.content.byteLength === 0) {
    return failure('empty-artifact', 'The artifact is empty.');
  }
  if (input.content.byteLength > BRIDGE_MAX_ARTIFACT_BYTES) {
    return failure(
      'artifact-too-large',
      `The artifact exceeds the ${BRIDGE_MAX_ARTIFACT_BYTES} byte limit of the local bridge.`,
    );
  }
  return null;
}

function validateRef(input: LocalBridgeArtifactRef): LocalBridgeFailure | null {
  if (!isSafeArtifactSessionId(input.sessionId)) {
    return failure('invalid-session-id', 'The session id cannot be used as a storage folder.');
  }
  if (!isSafeArtifactName(input.name)) {
    return failure('invalid-artifact-name', 'The artifact name cannot be used as a file name.');
  }
  return null;
}

function isAllowedMediaType(value: string): boolean {
  return (BRIDGE_ARTIFACT_MEDIA_TYPES as readonly string[]).includes(value);
}

function failure(reason: LocalBridgeFailure['reason'], message: string): LocalBridgeFailure {
  return { ok: false, reason, message, code: null };
}

/**
 * A port that throws is treated like an unavailable bridge: a broken adapter must not crash
 * the panel or lose an export flow.
 */
function transportFailure(): LocalBridgeFailure {
  return {
    ok: false,
    reason: 'bridge-unavailable',
    message: TRANSPORT_FAILURE_MESSAGE,
    code: null,
  };
}
