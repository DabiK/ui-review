import { describe, expect, it } from 'vitest';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SystemClockAdapter } from '@adapters/runtime/system-clock';
import { describeClockPortContract } from './clock.contract';

describeClockPortContract({
  createClock: (initialIso) => new FixedClockAdapter(initialIso),
});

describeClockPortContract({
  createClock: () => new SystemClockAdapter(),
});

describe('FixedClockAdapter', () => {
  it('returns the configured instant until it is moved', () => {
    const clock = new FixedClockAdapter('2026-09-18T10:00:00.000Z');

    expect(clock.now()).toBe('2026-09-18T10:00:00.000Z');

    clock.set('2026-09-18T10:30:00.000Z');

    expect(clock.now()).toBe('2026-09-18T10:30:00.000Z');
  });

  it('rejects a non-UTC instant', () => {
    expect(() => new FixedClockAdapter('2026-09-18 10:00')).toThrow();
  });
});

describe('SystemClockAdapter', () => {
  it('tracks the host clock', () => {
    const before = Date.now();
    const now = Date.parse(new SystemClockAdapter().now());

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
