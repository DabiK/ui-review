import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  buildSessionName,
  createReviewSession,
  findCurrentSessionForPage,
  formatSessionTimestamp,
  isReviewablePageUrl,
  renameSession,
  sortSessionsByRecency,
  stopSession,
  type ReviewSession,
} from '@core';

const STARTED_AT = '2026-09-18T10:00:00.000Z';

function makeSession(overrides: {
  id: string;
  pageUrl?: string;
  startedAt?: string;
}): ReviewSession {
  return createReviewSession({
    id: overrides.id,
    name: `${overrides.id} — 18 Sep 2026`,
    pageUrl: overrides.pageUrl ?? 'https://example.com/pricing?plan=team',
    startedAt: overrides.startedAt ?? STARTED_AT,
  });
}

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

describe('session naming and page eligibility', () => {
  it('builds a deterministic UTC name from the hostname and timestamp', () => {
    expect(buildSessionName('example.com', STARTED_AT)).toBe('example.com — 18 Sep 2026, 10:00');
  });

  it('formats timestamps in UTC regardless of the host locale', () => {
    expect(formatSessionTimestamp('2026-01-05T07:05:00.000Z')).toBe('5 Jan 2026, 07:05');
  });

  it('rejects a blank hostname when building a name', () => {
    expect(() => buildSessionName('  ', STARTED_AT)).toThrow(DomainValidationError);
  });

  it('only accepts http(s) pages as reviewable', () => {
    expect(isReviewablePageUrl('https://example.com/a?b=1')).toBe(true);
    expect(isReviewablePageUrl('http://localhost:5173/')).toBe(true);
    expect(isReviewablePageUrl('chrome://extensions')).toBe(false);
    expect(isReviewablePageUrl('file:///tmp/page.html')).toBe(false);
    expect(isReviewablePageUrl('about:blank')).toBe(false);
    expect(isReviewablePageUrl('not a url')).toBe(false);
  });
});

describe('session transitions', () => {
  const session = makeSession({ id: 'session-1' });

  it('stops an active session exactly once and records the stop time', () => {
    const stopped = stopSession(session, '2026-09-18T10:30:00.000Z');

    expect(stopped).toEqual({
      ...session,
      status: 'stopped',
      stoppedAt: '2026-09-18T10:30:00.000Z',
    });
    expect(() => stopSession(stopped, '2026-09-18T11:00:00.000Z')).toThrow(DomainValidationError);
  });

  it('rejects a stop timestamp before the start', () => {
    expect(() => stopSession(session, '2026-09-18T09:59:59.000Z')).toThrow(DomainValidationError);
  });

  it('renames without altering status, timestamps or comments', () => {
    const renamed = renameSession(session, 'Pricing page review');

    expect(renamed).toEqual({ ...session, name: 'Pricing page review' });
    expect(() => renameSession(session, '   ')).toThrow(DomainValidationError);
  });

  it('sorts sessions newest first with a stable tie-breaker', () => {
    const older = makeSession({ id: 'session-a', startedAt: '2026-09-18T09:00:00.000Z' });
    const newer = makeSession({ id: 'session-b', startedAt: '2026-09-18T11:00:00.000Z' });

    expect(sortSessionsByRecency([older, newer]).map((item) => item.id)).toEqual([
      'session-b',
      'session-a',
    ]);
  });

  it('prefers the active session of a page over a newer stopped one', () => {
    const pageUrl = 'https://example.com/pricing';
    const active = makeSession({ id: 'active', pageUrl, startedAt: '2026-09-18T09:00:00.000Z' });
    const stopped = stopSession(
      makeSession({ id: 'stopped', pageUrl, startedAt: '2026-09-18T11:00:00.000Z' }),
      '2026-09-18T11:30:00.000Z',
    );
    const otherPage = makeSession({ id: 'other', pageUrl: 'https://example.com/' });

    expect(findCurrentSessionForPage([stopped, otherPage, active], pageUrl)?.id).toBe('active');
    expect(findCurrentSessionForPage([stopped, otherPage], pageUrl)?.id).toBe('stopped');
    expect(findCurrentSessionForPage([otherPage], pageUrl)).toBeNull();
  });
});
