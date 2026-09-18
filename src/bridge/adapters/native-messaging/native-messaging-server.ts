import { Buffer } from 'node:buffer';
import type { Readable, Writable } from 'node:stream';
import { errorResponse, readRequestId, type BridgeResponse } from '../../../core/bridge/protocol';
import { decodeNativeFrames, encodeNativeMessage } from './message-framing';

export interface NativeMessagingServerOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly handle: (message: unknown) => Promise<BridgeResponse> | BridgeResponse;
  /** Human-readable diagnostics go to stderr, never to the protocol stdout pipe. */
  readonly onProtocolError?: (message: string) => void;
}

export interface NativeMessagingServer {
  stop(): void;
}

/**
 * Serves the Native Messaging stdio protocol: frames in, frames out. Every failure is
 * reported as a protocol error response (or stderr diagnostics) instead of an unhandled
 * exception, because Chrome owns the pipes and a crash would silently kill the bridge.
 */
export function serveNativeMessaging(
  options: NativeMessagingServerOptions,
): NativeMessagingServer {
  let buffer: Buffer = Buffer.alloc(0);
  let stopped = false;

  const report = (message: string): void => {
    options.onProtocolError?.(message);
  };

  const write = (response: BridgeResponse): void => {
    if (stopped) {
      return;
    }
    try {
      options.output.write(encodeNativeMessage(response));
    } catch (error) {
      report(error instanceof Error ? error.message : 'The bridge could not write a response.');
      stopped = true;
    }
  };

  const processBuffer = (): void => {
    const decoded = decodeNativeFrames(buffer);
    if (!decoded.ok) {
      buffer = Buffer.alloc(0);
      report(decoded.message);
      write(errorResponse('', { code: 'invalid-request', message: decoded.message }));
      return;
    }

    buffer = decoded.remainder;
    for (const raw of decoded.frames) {
      let message: unknown;
      try {
        message = JSON.parse(raw);
      } catch {
        const diagnostic = 'The bridge frame is not valid JSON.';
        report(diagnostic);
        write(errorResponse('', { code: 'invalid-request', message: diagnostic }));
        continue;
      }

      Promise.resolve(options.handle(message)).then(write, (error: unknown) => {
        report(error instanceof Error ? error.message : 'The bridge handler failed.');
        write(
          errorResponse(readRequestId(message), {
            code: 'io-error',
            message: 'The bridge operation failed unexpectedly.',
          }),
        );
      });
    }
  };

  options.input.on('data', (chunk: Buffer | string) => {
    if (stopped) {
      return;
    }
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    processBuffer();
  });

  options.input.on('error', (error: Error) => {
    report(error.message);
    stopped = true;
  });

  options.output.on('error', () => {
    // The extension went away (EPIPE); stop answering instead of crashing the host.
    stopped = true;
  });

  return {
    stop(): void {
      stopped = true;
    },
  };
}
