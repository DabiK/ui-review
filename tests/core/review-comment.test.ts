import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMENT_CATEGORY,
  DEFAULT_COMMENT_PRIORITY,
  DomainValidationError,
  createReviewComment,
} from '@core';

const CREATED_AT = '2026-09-18T10:00:00.000Z';

const baseInput = {
  id: 'comment-1',
  sessionId: 'session-1',
  text: 'The primary action is not aligned with the title.',
  pageUrl: 'https://example.com/pricing',
  viewport: { width: 1440, height: 900 },
  createdAt: CREATED_AT,
} as const;

describe('createReviewComment', () => {
  it('defaults category to UI and priority to important', () => {
    const comment = createReviewComment(baseInput);

    expect(comment.category).toBe(DEFAULT_COMMENT_CATEGORY);
    expect(comment.priority).toBe(DEFAULT_COMMENT_PRIORITY);
    expect(comment.category).toBe('UI');
    expect(comment.priority).toBe('important');
  });

  it('keeps explicit category, priority and updatedAt', () => {
    const comment = createReviewComment({
      ...baseInput,
      category: 'Accessibility',
      priority: 'critical',
      updatedAt: '2026-09-18T11:00:00.000Z',
    });

    expect(comment.category).toBe('Accessibility');
    expect(comment.priority).toBe('critical');
    expect(comment.updatedAt).toBe('2026-09-18T11:00:00.000Z');
  });

  it('links evidence and attachments given by the caller', () => {
    const comment = createReviewComment({
      ...baseInput,
      evidence: [
        {
          id: 'evidence-1',
          commentId: 'comment-1',
          confidence: 'inferred',
          capturedAt: CREATED_AT,
          payload: {
            type: 'framework',
            framework: 'react',
            componentName: 'PricingCard',
            componentChain: ['PricingPage', 'PricingCard'],
          },
        },
      ],
      attachments: [
        {
          id: 'attachment-1',
          commentId: 'comment-1',
          kind: 'element-crop',
          mimeType: 'image/png',
          width: 320,
          height: 180,
          byteLength: 2048,
          createdAt: CREATED_AT,
          storage: { type: 'inline-data-url', dataUrl: 'data:image/png;base64,AAAA' },
        },
      ],
    });

    expect(comment.evidence).toHaveLength(1);
    expect(comment.evidence[0]?.confidence).toBe('inferred');
    expect(comment.attachments).toHaveLength(1);
    expect(comment.attachments[0]?.storage.type).toBe('inline-data-url');
  });

  it('rejects blank text, including whitespace only', () => {
    expect(() => createReviewComment({ ...baseInput, text: '' })).toThrow(DomainValidationError);
    expect(() => createReviewComment({ ...baseInput, text: '  \n ' })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects a non-positive viewport', () => {
    expect(() =>
      createReviewComment({ ...baseInput, viewport: { width: 0, height: 900 } }),
    ).toThrow(DomainValidationError);
  });

  it('rejects a page URL that is not http(s)', () => {
    expect(() => createReviewComment({ ...baseInput, pageUrl: 'file:///tmp/page.html' })).toThrow(
      DomainValidationError,
    );
  });

  it('defaults updatedAt to createdAt', () => {
    expect(createReviewComment(baseInput).updatedAt).toBe(CREATED_AT);
  });
});
