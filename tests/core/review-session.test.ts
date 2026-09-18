import { describe, expect, it } from 'vitest';
import { DomainValidationError, createReviewSession } from '@core';

const STARTED_AT = '2026-09-18T10:00:00.000Z';

describe('createReviewSession', () => {
  it('creates an active session with a derived hostname and no comments', () => {
    const session = createReviewSession({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026',
      pageUrl: 'https://example.com/pricing?plan=team',
      startedAt: STARTED_AT,
    });

    expect(session).toEqual({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026',
      status: 'active',
      pageUrl: 'https://example.com/pricing?plan=team',
      hostname: 'example.com',
      startedAt: STARTED_AT,
      stoppedAt: null,
      comments: [],
    });
  });

  it('rejects a blank name', () => {
    expect(() =>
      createReviewSession({
        id: 'session-1',
        name: '   ',
        pageUrl: 'https://example.com',
        startedAt: STARTED_AT,
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects a non-http page URL', () => {
    expect(() =>
      createReviewSession({
        id: 'session-1',
        name: 'Extension page',
        pageUrl: 'chrome://extensions',
        startedAt: STARTED_AT,
      }),
    ).toThrow(DomainValidationError);
  });

  it('rejects a non-UTC timestamp', () => {
    expect(() =>
      createReviewSession({
        id: 'session-1',
        name: 'example.com',
        pageUrl: 'https://example.com',
        startedAt: '2026-09-18 10:00',
      }),
    ).toThrow(DomainValidationError);
  });
});
