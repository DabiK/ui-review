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
import { renderReviewBriefMarkdown } from '../../core/handoff/review-brief';
import type { ArtifactStorePort } from './ports/artifact-store';
import type { HandoffWriterPort } from './ports/handoff-writer';

/**
 * Bridge request handler: the only place where an incoming message is turned into an
 * operation. The order is deliberate — envelope, origin allowlist, then payload, then
 * storage — so unknown messages, disallowed callers and malformed payloads are rejected
 * before any filesystem write. The bridge core stays platform-free and synchronous-testable.
 */

export interface BridgeHandlerDeps {
  readonly store: ArtifactStorePort;
  readonly handoff: HandoffWriterPort;
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
      case 'handoff.materialize':
        return await handleHandoffMaterialize(envelope, payload, deps);
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

async function handleHandoffMaterialize(
  envelope: BridgeEnvelope,
  payload: unknown,
  deps: BridgeHandlerDeps,
): Promise<BridgeResponse> {
  const parsed = parseBridgePayload('handoff.materialize', payload);
  if (!parsed.ok) {
    return errorResponse(envelope.requestId, parsed.error);
  }

  const { sessionId, brief, files } = parsed.value;
  const planned = deps.handoff.plan({
    sessionId,
    fileNames: files.map((file) => file.name),
  });
  if (!planned.ok) {
    return errorResponse(envelope.requestId, { code: planned.code, message: planned.message });
  }

  const markdown = renderReviewBriefMarkdown(brief, planned.plan);
  const reviewJson = `${JSON.stringify(brief, null, 2)}\n`;
  const outcome = await deps.handoff.materialize({
    sessionId,
    reviewJson,
    reviewMarkdown: markdown,
    files,
  });
  if (!outcome.ok) {
    return errorResponse(envelope.requestId, { code: outcome.code, message: outcome.message });
  }

  return successResponse(envelope.requestId, {
    kind: 'handoff.materialize',
    sessionId,
    directory: outcome.handoff.directory,
    markdownPath: outcome.handoff.markdownPath,
    jsonPath: outcome.handoff.jsonPath,
    files: outcome.handoff.files,
    markdown,
  });
}

function describeUnexpectedFailure(error: unknown): string {
  return error instanceof Error
    ? `The bridge operation failed: ${error.message}`
    : 'The bridge operation failed.';
}