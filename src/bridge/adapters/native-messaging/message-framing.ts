import { Buffer } from 'node:buffer';

/**
 * Chrome Native Messaging wire framing: each message is a 4-byte unsigned length prefix
 * (native byte order, little-endian on every platform Chrome supports) followed by the
 * UTF-8 JSON payload. No HTTP, no socket, no port: only the stdio pipes Chrome owns.
 */

export const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;

export function encodeNativeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.allocUnsafe(4 + payload.byteLength);
  frame.writeUInt32LE(payload.byteLength, 0);
  payload.copy(frame, 4);
  return frame;
}

export type NativeFramesResult =
  | { readonly ok: true; readonly frames: readonly string[]; readonly remainder: Buffer }
  | { readonly ok: false; readonly message: string };

/** Splits a possibly partial buffer into complete JSON strings, keeping the remainder. */
export function decodeNativeFrames(
  buffer: Buffer,
  maxFrameBytes: number = MAX_NATIVE_MESSAGE_BYTES,
): NativeFramesResult {
  const frames: string[] = [];
  let offset = 0;

  while (buffer.byteLength - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
    if (length > maxFrameBytes) {
      return {
        ok: false,
        message: `A native message declared ${length} bytes, above the ${maxFrameBytes} byte limit.`,
      };
    }
    if (buffer.byteLength - offset - 4 < length) {
      break;
    }

    frames.push(buffer.subarray(offset + 4, offset + 4 + length).toString('utf8'));
    offset += 4 + length;
  }

  return { ok: true, frames, remainder: buffer.subarray(offset) };
}
