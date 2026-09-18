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

  it('leaves non-URL values, non-http schemes and secret-free references unchanged', () => {
    expect(redactUrlSecrets('Save')).toBe('Save');
    expect(redactUrlSecrets('mailto:review@example.com?subject=Hello')).toBe(
      'mailto:review@example.com?subject=Hello',
    );
    expect(redactUrlSecrets('/pricing#plans')).toBe('/pricing#plans');
    expect(redactUrlSecrets('../settings?page=2')).toBe('../settings?page=2');
  });

  it('redacts secret fragment parameters of absolute URLs', () => {
    const redacted = redactUrlSecrets(
      'https://example.com/callback#access_token=abc123&page=2',
    );

    expect(redacted).toContain('page=2');
    expect(redacted).not.toContain('abc123');
  });

  it('redacts secret query parameters inside absolute hash routes', () => {
    const redacted = redactUrlSecrets('https://app.example.com/#/route?token=abc123&tab=notes');

    expect(redacted).toContain('tab=notes');
    expect(redacted).not.toContain('abc123');
  });

  it('redacts secret query parameters of root-relative references', () => {
    const redacted = redactUrlSecrets('/login?token=abc123&next=/home');

    expect(redacted).toContain('next=');
    expect(redacted).not.toContain('abc123');
  });

  it('redacts secret query parameters of protocol-relative references', () => {
    const redacted = redactUrlSecrets('//cdn.example.com/script.js?api_key=abc123&v=2');

    expect(redacted).toContain('v=2');
    expect(redacted).not.toContain('abc123');
  });

  it('redacts relative fragments and strips protocol-relative credentials', () => {
    const redacted = redactUrlSecrets('//user:hunter2@cdn.example.com/x#access_token=abc123');

    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('abc123');
    expect(redacted).toContain('//cdn.example.com/x');
  });

  it('redacts fragment-only and query-only references', () => {
    expect(redactUrlSecrets('#access_token=abc123')).not.toContain('abc123');
    expect(redactUrlSecrets('?token=abc123')).not.toContain('abc123');
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

  it('redacts secrets inside URL attributes, absolute or not', () => {
    const redacted = redactAttributes({
      href: 'https://example.com/callback#access_token=abc123',
      src: '/reset?token=abc123',
      action: '//cdn.example.com/script.js?api_key=abc123',
      id: 'login',
    });

    expect(redacted['id']).toBe('login');
    for (const value of Object.values(redacted)) {
      expect(value).not.toContain('abc123');
    }
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

  it.each([
    ['absolute fragment', 'https://example.com/callback#access_token=abs123', 'abs123'],
    ['relative query', '/reset?token=rel123', 'rel123'],
    ['protocol-relative query', '//cdn.example.com/script.js?api_key=proto123', 'proto123'],
  ])('never serializes a secret from a %s URL attribute', (_case, url, secret) => {
    const evidence = createDomEvidence({
      id: 'evidence-2',
      commentId: 'comment-2',
      capturedAt: '2026-09-18T10:06:00.000Z',
      anchor: anchor({ href: url, 'data-testid': 'reset' }),
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('data-testid');
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
