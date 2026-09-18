import { describe, expect, it } from 'vitest';
import {
  REDACTED_VALUE,
  createDomEvidence,
  isSensitiveAttributeName,
  redactAttributes,
  redactUrlSecrets,
  sanitizeDomAnchor,
  type DomAnchor,
} from '@core';

function anchor(attributes: Readonly<Record<string, string>>): DomAnchor {
  return {
    fingerprint: 'main > button',
    ancestry: ['main'],
    text: 'Save',
    role: 'button',
    accessibleName: null,
    attributes,
    boundingBox: { x: 10, y: 20, width: 100, height: 32 },
    viewport: { width: 1440, height: 900 },
    computedStyles: { display: 'block' },
  };
}

describe('isSensitiveAttributeName', () => {
  it('matches whole secret-like tokens', () => {
    for (const name of [
      'value',
      'password',
      'data-token',
      'x-auth-token',
      'authorization',
      'api-key',
      'api_key',
      'client-secret',
      'session-id',
      'csrf-token',
      'aria-credentials',
      'data-pin-code',
    ]) {
      expect(isSensitiveAttributeName(name), name).toBe(true);
    }
  });

  it('does not over-redact lookalike names', () => {
    for (const name of [
      'author',
      'spinner',
      'aria-valuenow',
      'inputmode',
      'data-testid',
      'placeholder',
      'class',
      'tokenizer-name',
    ]) {
      expect(isSensitiveAttributeName(name), name).toBe(false);
    }
  });
});

describe('redactUrlSecrets', () => {
  it('replaces secret-like query parameters and keeps the rest', () => {
    const redacted = redactUrlSecrets('https://example.com/callback?token=abc123&page=2');

    expect(redacted).toContain('page=2');
    expect(redacted).not.toContain('abc123');
  });

  it('removes credentials embedded in the URL', () => {
    const redacted = redactUrlSecrets('https://user:hunter2@example.com/private');

    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('user:');
    expect(redacted).toBe('https://example.com/private');
  });

  it('returns non-URL and non-http values unchanged', () => {
    expect(redactUrlSecrets('Save')).toBe('Save');
    expect(redactUrlSecrets('/relative?token=abc')).toBe('/relative?token=abc');
  });
});

describe('redactAttributes', () => {
  it('replaces sensitive values with an explicit marker', () => {
    const redacted = redactAttributes({
      type: 'password',
      value: 'hunter2',
      'data-token': 'secret-token',
      id: 'login',
    });

    expect(redacted).toEqual({
      type: 'password',
      value: REDACTED_VALUE,
      'data-token': REDACTED_VALUE,
      id: 'login',
    });
  });

  it('never mutates the input record', () => {
    const input = { value: 'hunter2' };
    redactAttributes(input);
    expect(input.value).toBe('hunter2');
  });
});

describe('DOM evidence redaction', () => {
  it('sanitizes attributes even when an adapter captured too much', () => {
    const evidence = createDomEvidence({
      id: 'evidence-1',
      commentId: 'comment-1',
      capturedAt: '2026-09-18T10:05:00.000Z',
      anchor: anchor({
        type: 'password',
        value: 'hunter2',
        'data-api-key': 'sk-live-123',
        href: 'https://example.com/reset?token=abc123',
        class: 'field',
      }),
    });

    expect(evidence.payload).toMatchObject({
      type: 'dom',
      attributes: {
        type: 'password',
        value: REDACTED_VALUE,
        'data-api-key': REDACTED_VALUE,
        class: 'field',
      },
    });
    if (evidence.payload.type !== 'dom') {
      throw new Error('expected DOM evidence');
    }
    expect(evidence.payload.attributes['href']).not.toContain('abc123');
    expect(JSON.stringify(evidence)).not.toContain('hunter2');
    expect(JSON.stringify(evidence)).not.toContain('sk-live-123');
  });

  it('keeps every non-secret field intact', () => {
    const sanitized = sanitizeDomAnchor(
      anchor({ class: 'button', 'data-testid': 'save-button' }),
    );

    expect(sanitized).toMatchObject({
      fingerprint: 'main > button',
      text: 'Save',
      attributes: { class: 'button', 'data-testid': 'save-button' },
      computedStyles: { display: 'block' },
    });
  });
});
