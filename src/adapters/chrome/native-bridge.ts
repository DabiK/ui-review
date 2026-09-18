import {
  BRIDGE_HOST_NAME,
  BRIDGE_PROTOCOL_VERSION,
  encodeBase64,
  parseBridgeResponse,
  type IdGeneratorPort,
  type LocalBridgeArtifactRef,
  type LocalBridgeArtifactWriteInput,
  type LocalBridgeHandoffInput,
  type LocalBridgeHandoffResult,
  type LocalBridgeHealthResult,
  type LocalBridgePort,
  type LocalBridgeReadResult,
  type LocalBridgeWriteResult,
} from '@core';
import {
  handoffOutcome,
  healthOutcome,
  interpretBridgeResponse,
  invalidResponseFailure,
  readOutcome,
  transportFailure,
  writeOutcome,
} from '../local-bridge/bridge-outcomes';

export interface ChromeNativeMessagingBridgeAdapterOptions {
  readonly ids: IdGeneratorPort;
  /** Native Messaging host name; defaults to the registered host. */
  readonly hostName?: string;
}

const TRANSPORT_MESSAGE = 'The local bridge is not installed or not reachable.';

/**
 * Production `LocalBridgePort`: speaks the versioned protocol to the companion executable
 * through `chrome.runtime.sendNativeMessage`. Chrome owns the process and the pipes; no
 * localhost port is involved. Transport failures become typed `bridge-unavailable` results.
 */
export class ChromeNativeMessagingBridgeAdapter implements LocalBridgePort {
  private readonly ids: IdGeneratorPort;
  private readonly hostName: string;

  constructor(options: ChromeNativeMessagingBridgeAdapterOptions) {
    this.ids = options.ids;
    this.hostName = options.hostName ?? BRIDGE_HOST_NAME;
  }

  async checkHealth(): Promise<LocalBridgeHealthResult> {
    const interpreted = await this.request('bridge.health', {});
    return interpreted.ok ? healthOutcome(interpreted.response) : interpreted.failure;
  }

  async writeArtifact(input: LocalBridgeArtifactWriteInput): Promise<LocalBridgeWriteResult> {
    const interpreted = await this.request('artifact.write', {
      sessionId: input.sessionId,
      name: input.name,
      mediaType: input.mediaType,
      contentBase64: encodeBase64(input.content),
    });
    return interpreted.ok ? writeOutcome(interpreted.response) : interpreted.failure;
  }

  async readArtifact(input: LocalBridgeArtifactRef): Promise<LocalBridgeReadResult> {
    const interpreted = await this.request('artifact.read', {
      sessionId: input.sessionId,
      name: input.name,
    });
    return interpreted.ok ? readOutcome(interpreted.response) : interpreted.failure;
  }

  async materializeHandoff(input: LocalBridgeHandoffInput): Promise<LocalBridgeHandoffResult> {
    const interpreted = await this.request('handoff.materialize', {
      sessionId: input.sessionId,
      brief: input.brief,
      files: input.files.map((file) => ({
        name: file.name,
        mediaType: file.mediaType,
        contentBase64: encodeBase64(file.content),
      })),
    });
    return interpreted.ok ? handoffOutcome(interpreted.response) : interpreted.failure;
  }

  private async request(
    operation: 'bridge.health' | 'artifact.write' | 'artifact.read' | 'handoff.materialize',
    payload: unknown,
  ): Promise<ReturnType<typeof interpretBridgeResponse>> {
    let origin: string;
    try {
      origin = chrome.runtime.getURL('');
    } catch {
      return {
        ok: false,
        failure: transportFailure('The extension origin could not be resolved.'),
      };
    }

    const message = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: this.ids.createId(),
      operation,
      origin,
      payload,
    };

    let raw: unknown;
    try {
      raw = await chrome.runtime.sendNativeMessage(this.hostName, message);
      if (chrome.runtime.lastError !== undefined && chrome.runtime.lastError !== null) {
        return { ok: false, failure: transportFailure(describeLastError()) };
      }
    } catch (error) {
      return { ok: false, failure: transportFailure(describeTransportError(error)) };
    }

    const parsed = parseBridgeResponse(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        failure: invalidResponseFailure(`The bridge response is not valid: ${parsed.error.message}`),
      };
    }

    return interpretBridgeResponse(parsed.value, operation);
  }
}

function describeLastError(): string {
  const message = chrome.runtime.lastError?.message;
  return message !== undefined && message.length > 0
    ? `The local bridge is not available: ${message}`
    : TRANSPORT_MESSAGE;
}

function describeTransportError(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? `The local bridge is not available: ${error.message}`
    : TRANSPORT_MESSAGE;
}
