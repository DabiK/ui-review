import { encodeBase64 } from '../../core/bridge/base64';
import {
  errorResponse,
  parseBridgeEnvelope,
  parseBridgePayload,
  readRequestId,
  successResponse,
  type BridgeEnvelope,
  type BridgeResponse,
} from '../../core/bridge/protocol';
import type { ArtifactStorePort } from './ports/artifact-store';

/**
 * Bridge request handler: the only place where an incoming message is turned into an
 * operation. The order is deliberate — envelope, origin allowlist, then payload, then
 * storage — so unknown messages, disallowed callers and malformed payloads are rejected
 * before any filesystem write. The bridge core stays platform-free and synchronous-testable.
 */

export interface BridgeHandlerDeps {
  readonly store: ArtifactStorePort;
  /** Exact origins allowed to talk to this bridge; empty means fail closed. */
  readonly allowedOrigins: readonly string[];
  readonly bridgeVersion: string;
  readonly platform: string;
}

export async function handleBridgeMessage(
  raw: unknown,
  deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
  const parsed = parseBridgeEnvelope(raw);
  if (!parsed.ok) {
    return errorResponse(readRequestId(raw), parsed.error);
  }

  const { envelope, payload } = parsed.value;

  if (!deps.allowedOrigins.includes(envelope.origin)) {
    return errorResponse(envelope.requestId, {
      code: 'origin-not-allowed',
      message: `The origin ${envelope.origin} is not allowed to talk to this bridge.`,
    });
  }

  try {
    switch (envelope.operation) {
      case 'bridge.health':
        return handleHealth(envelope, payload, deps);
      case 'artifact.write':
        return await handleArtifactWrite(envelope, payload, deps);
      case 'artifact.read':
        return await handleArtifactRead(envelope, payload, deps);
    }
  } catch (error) {
    return errorResponse(envelope.requestId, {
      code: 'io-error',
      message: describeUnexpectedFailure(error),
    });
  }
}

function handleHealth(
  envelope: BridgeEnvelope,
  payload: unknown,
  deps: BridgeHandlerDeps,
): BridgeResponse {
  const parsed = parseBridgePayload('bridge.health', payload);
  if (!parsed.ok) {
    return errorResponse(envelope.requestId, parsed.error);
  }

  return successResponse(envelope.requestId, {
    kind: 'bridge.health',
    status: 'ok',
    bridgeVersion: deps.bridgeVersion,
    platform: deps.platform,
    artifactRoot: deps.store.root,
  });
}

async function handleArtifactWrite(
  envelope: BridgeEnvelope,
  payload: unknown,
  deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
  const parsed = parseBridgePayload('artifact.write', payload);
  if (!parsed.ok) {
    return errorResponse(envelope.requestId, parsed.error);
  }

  const { sessionId, name, mediaType, content } = parsed.value;
  const outcome = await deps.store.write({ sessionId, name, mediaType, content });
  if (!outcome.ok) {
    return errorResponse(envelope.requestId, { code: outcome.code, message: outcome.message });
  }

  return successResponse(envelope.requestId, {
    kind: 'artifact.write',
    sessionId,
    name,
    path: outcome.artifact.path,
    byteLength: outcome.artifact.byteLength,
  });
}

async function handleArtifactRead(
  envelope: BridgeEnvelope,
  payload: unknown,
  deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
  const parsed = parseBridgePayload('artifact.read', payload);
  if (!parsed.ok) {
    return errorResponse(envelope.requestId, parsed.error);
  }

  const { sessionId, name } = parsed.value;
  const outcome = await deps.store.read({ sessionId, name });
  if (!outcome.ok) {
    return errorResponse(envelope.requestId, { code: outcome.code, message: outcome.message });
  }

  return successResponse(envelope.requestId, {
    kind: 'artifact.read',
    sessionId,
    name,
    path: outcome.artifact.path,
    byteLength: outcome.artifact.byteLength,
    mediaType: outcome.artifact.mediaType,
    contentBase64: encodeBase64(outcome.artifact.content),
  });
}

function describeUnexpectedFailure(error: unknown): string {
  return error instanceof Error
    ? `The bridge operation failed: ${error.message}`
    : 'The bridge operation failed.';
}
