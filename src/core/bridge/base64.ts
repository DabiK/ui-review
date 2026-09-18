/**
 * Minimal, dependency-free base64 codec shared by the extension and the native bridge.
 *
 * The wire protocol carries artifact bytes as base64 strings, so both sides must use the
 * exact same encoder and, more importantly, the same strict decoder: anything that is not
 * canonical base64 is refused instead of being silently repaired into different bytes.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const DECODE_TABLE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

export interface Base64DecodeFailure {
  readonly ok: false;
  readonly message: string;
}

export type Base64DecodeResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | Base64DecodeFailure;

/** Encodes bytes as canonical base64 with padding. Chunked to stay safe on large captures. */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // Chunk boundaries must stay aligned on 3 input bytes, otherwise padding would be
  // emitted in the middle of the stream and the result would not be canonical base64.
  const chunkSize = 0x8000 - (0x8000 % 3);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(encodeChunk(bytes.subarray(offset, offset + chunkSize)));
  }
  return parts.join('');
}

/**
 * Decodes canonical base64. Rejects whitespace, URL-safe alphabets, impossible lengths and
 * misplaced padding: an artifact request must describe the exact bytes it means.
 */
export function decodeBase64(text: string): Base64DecodeResult {
  if (!BASE64_PATTERN.test(text)) {
    return { ok: false, message: 'The value is not canonical base64.' };
  }

  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const quartets = text.length / 4;
  const byteLength = quartets * 3 - padding;
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let index = 0; index < text.length; index += 4) {
    const a = decodeChar(text.charCodeAt(index));
    const b = decodeChar(text.charCodeAt(index + 1));
    const c = text.charCodeAt(index + 2);
    const d = text.charCodeAt(index + 3);
    const cValue = c === 61 ? 0 : decodeChar(c);
    const dValue = d === 61 ? 0 : decodeChar(d);

    if (a < 0 || b < 0 || cValue < 0 || dValue < 0) {
      return { ok: false, message: 'The value is not canonical base64.' };
    }

    const triple = (a << 18) | (b << 12) | (cValue << 6) | dValue;
    if (byteIndex < byteLength) {
      bytes[byteIndex] = (triple >> 16) & 0xff;
      byteIndex += 1;
    }
    if (byteIndex < byteLength) {
      bytes[byteIndex] = (triple >> 8) & 0xff;
      byteIndex += 1;
    }
    if (byteIndex < byteLength) {
      bytes[byteIndex] = triple & 0xff;
      byteIndex += 1;
    }
  }

  return { ok: true, bytes };
}

function encodeChunk(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? (bytes[index + 1] ?? 0) : 0;
    const third = hasThird ? (bytes[index + 2] ?? 0) : 0;

    output += ALPHABET[first >> 2] ?? '';
    output += ALPHABET[((first & 0x03) << 4) | (second >> 4)] ?? '';
    output += hasSecond ? (ALPHABET[((second & 0x0f) << 2) | (third >> 6)] ?? '') : '=';
    output += hasThird ? (ALPHABET[third & 0x3f] ?? '') : '=';
  }
  return output;
}

function decodeChar(code: number): number {
  return code < 128 ? (DECODE_TABLE[code] ?? -1) : -1;
}
