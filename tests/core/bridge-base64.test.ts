import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '@core';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('base64 codec', () => {
  it('encodes the canonical vectors', () => {
    expect(encodeBase64(new Uint8Array())).toBe('');
    expect(encodeBase64(text('f'))).toBe('Zg==');
    expect(encodeBase64(text('fo'))).toBe('Zm8=');
    expect(encodeBase64(text('foo'))).toBe('Zm9v');
    expect(encodeBase64(text('foob'))).toBe('Zm9vYg==');
    expect(encodeBase64(text('fooba'))).toBe('Zm9vYmE=');
    expect(encodeBase64(text('foobar'))).toBe('Zm9vYmFy');
  });

  it('decodes the canonical vectors', () => {
    expect(decodeBase64('')).toEqual({ ok: true, bytes: new Uint8Array() });
    expect(decodeBase64('Zg==')).toEqual({ ok: true, bytes: text('f') });
    expect(decodeBase64('Zm8=')).toEqual({ ok: true, bytes: text('fo') });
    expect(decodeBase64('Zm9vYg==')).toEqual({ ok: true, bytes: text('foob') });
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index;
    }

    const encoded = encodeBase64(bytes);
    const decoded = decodeBase64(encoded);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(Array.from(decoded.bytes)).toEqual(Array.from(bytes));
    }
  });

  it('round-trips a large payload without hitting a call-stack limit', () => {
    const bytes = new Uint8Array(1024 * 1024);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 251;
    }

    const decoded = decodeBase64(encodeBase64(bytes));

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.bytes.byteLength).toBe(bytes.byteLength);
      expect(decoded.bytes[0]).toBe(0);
      expect(decoded.bytes[bytes.length - 1]).toBe((bytes.length - 1) % 251);
    }
  });

  it('rejects non-canonical base64 instead of repairing it', () => {
    const invalid = [
      'a',
      'abc',
      '!!!!',
      'Zg=',
      'Zg===',
      'Zm 9v',
      'Zm9v\n',
      'Zm9v-',
      'Zm9v_',
      '=AAA',
      'AA=A',
      'AAA=AAAA',
    ];

    for (const value of invalid) {
      const decoded = decodeBase64(value);
      expect(decoded.ok).toBe(false);
      if (!decoded.ok) {
        expect(decoded.message).toMatch(/base64/i);
      }
    }
  });
});
