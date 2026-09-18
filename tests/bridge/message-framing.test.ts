import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { decodeNativeFrames, encodeNativeMessage } from '../../src/bridge/adapters/native-messaging/message-framing';

describe('native message framing', () => {
  it('encodes a length-prefixed UTF-8 JSON message', () => {
    const frame = encodeNativeMessage({ hello: 'world' });

    expect(frame.readUInt32LE(0)).toBe(frame.byteLength - 4);
    expect(JSON.parse(frame.subarray(4).toString('utf8'))).toEqual({ hello: 'world' });
  });

  it('round-trips several frames received in one chunk', () => {
    const buffer = Buffer.concat([
      encodeNativeMessage({ n: 1 }),
      encodeNativeMessage({ n: 2 }),
      encodeNativeMessage({ n: 3 }),
    ]);

    const decoded = decodeNativeFrames(buffer);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.frames.map((frame) => JSON.parse(frame))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
      expect(decoded.remainder.byteLength).toBe(0);
    }
  });

  it('reassembles a frame split across chunks', () => {
    const frame = encodeNativeMessage({ long: 'x'.repeat(1000) });
    const first = decodeNativeFrames(frame.subarray(0, 700));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.frames).toHaveLength(0);

    const second = decodeNativeFrames(Buffer.concat([first.remainder, frame.subarray(700)]));

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(JSON.parse(second.frames[0] ?? '')).toEqual({ long: 'x'.repeat(1000) });
    }
  });

  it('keeps a partial trailing frame as remainder', () => {
    const buffer = Buffer.concat([
      encodeNativeMessage({ n: 1 }),
      encodeNativeMessage({ n: 2 }).subarray(0, 5),
    ]);

    const decoded = decodeNativeFrames(buffer);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.frames).toHaveLength(1);
      expect(decoded.remainder.byteLength).toBe(5);
    }
  });

  it('refuses an oversized declared length', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(1024, 0);

    const decoded = decodeNativeFrames(header, 64);

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.message).toMatch(/limit/i);
    }
  });
});
