import {
  BRIDGE_PROTOCOL_VERSION,
  encodeBase64,
  type BridgeOperation,
  type BridgeResponse,
  type BridgeSuccessResponse,
  type LocalBridgeArtifactRef,
  type LocalBridgeArtifactWriteInput,
  type LocalBridgeFailure,
  type LocalBridgeHandoffInput,
  type LocalBridgeHandoffResult,
  type LocalBridgeHealthResult,
  type LocalBridgePort,
  type LocalBridgeReadResult,
  type LocalBridgeWriteResult,
} from '@core';
import { InMemoryArtifactStore } from '../../bridge/adapters/in-memory/in-memory-artifact-store';
import { InMemoryHandoffWriter } from '../../bridge/adapters/in-memory/in-memory-handoff-writer';
import { handleBridgeMessage, type BridgeHandlerDeps } from '../../bridge/core/handle-request';
import {
  handoffOutcome,
  healthOutcome,
  interpretBridgeResponse,
  readOutcome,
  writeOutcome,
} from '../local-bridge/bridge-outcomes';

/** Origin asserted by the in-process adapter; matches its default allowlist. */
export const IN_MEMORY_BRIDGE_ORIGIN = 'chrome-extension://in-memory-bridge/';

export interface InMemoryLocalBridgeOptions {
  readonly origin?: string;
  readonly allowedOrigins?: readonly string[];
  readonly artifactRoot?: string;
  readonly handoffRoot?: string;
  readonly bridgeVersion?: string;
  readonly platform?: string;
}

/**
 * Portable `LocalBridgePort` backed by the real bridge handler and the real in-memory
 * artifact store. It is the second implementation required by the architecture: tests and
 * previews exercise the exact same protocol validation and artifact logic as the native
 * executable, without spawning a process.
 */
export class InMemoryLocalBridgeAdapter implements LocalBridgePort {
  private failure: LocalBridgeFailure | null = null;

  private readonly origin: string;

  private readonly deps: BridgeHandlerDeps;

  /** Handoff bytes written in process; exposed for assertions in tests and previews. */
  private readonly handoffWriter: InMemoryHandoffWriter;

  constructor(options: InMemoryLocalBridgeOptions = {}) {
    this.origin = options.origin ?? IN_MEMORY_BRIDGE_ORIGIN;
    this.handoffWriter = new InMemoryHandoffWriter({
      root: options.handoffRoot ?? '/ui-review-memory-handoff',
    });
    this.deps = {
      store: new InMemoryArtifactStore({ root: options.artifactRoot ?? '/ui-review-memory' }),
      handoff: this.handoffWriter,
      allowedOrigins: options.allowedOrigins ?? [this.origin],
      bridgeVersion: options.bridgeVersion ?? '0.1.0',
      platform: options.platform ?? 'in-memory',
    };
  }

  /** Scripts an explicit failure (unavailable bridge, refusal) for tests and previews. */
  setFailure(failure: LocalBridgeFailure | null): void {
    this.failure = failure;
  }

  async checkHealth(): Promise<LocalBridgeHealthResult> {
    return this.perform('bridge.health', {}, healthOutcome);
  }

  async writeArtifact(input: LocalBridgeArtifactWriteInput): Promise<LocalBridgeWriteResult> {
    return this.perform(
      'artifact.write',
      {
        sessionId: input.sessionId,
        name: input.name,
        mediaType: input.mediaType,
        contentBase64: encodeBase64(input.content),
      },
      writeOutcome,
    );
  }

  async readArtifact(input: LocalBridgeArtifactRef): Promise<LocalBridgeReadResult> {
    return this.perform(
      'artifact.read',
      { sessionId: input.sessionId, name: input.name },
      readOutcome,
    );
  }

  async materializeHandoff(input: LocalBridgeHandoffInput): Promise<LocalBridgeHandoffResult> {
    return this.perform(
      'handoff.materialize',
      {
        sessionId: input.sessionId,
        brief: input.brief,
        files: input.files.map((file) => ({
          name: file.name,
          mediaType: file.mediaType,
          contentBase64: encodeBase64(file.content),
        })),
      },
      handoffOutcome,
    );
  }

  /** Exact bytes of one handoff file written by the in-process bridge, for assertions. */
  readHandoffFile(sessionId: string, name: string): Uint8Array | null {
    return this.handoffWriter.readFile(sessionId, name);
  }

  /** File names currently materialized for a handoff, for assertions. */
  handoffFileNames(sessionId: string): readonly string[] {
    return this.handoffWriter.fileNames(sessionId);
  }

  private async perform<T>(
    operation: BridgeOperation,
    payload: unknown,
    map: (response: BridgeSuccessResponse) => T,
  ): Promise<T | LocalBridgeFailure> {
    if (this.failure !== null) {
      return this.failure;
    }

    const response: BridgeResponse = await handleBridgeMessage(
      {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: `in-memory-${operation}`,
        operation,
        origin: this.origin,
        payload,
      },
      this.deps,
    );

    const interpreted = interpretBridgeResponse(response, operation);
    return interpreted.ok ? map(interpreted.response) : interpreted.failure;
  }
}
