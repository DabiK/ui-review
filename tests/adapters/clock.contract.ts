import { describe, expect, it } from 'vitest';
import type { ClockPort } from '@core';

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface ClockPortContractOptions {
  /**
   * Returns a clock started at the given instant. The in-memory double reads it back;
   * the system clock may ignore it and return the host time.
   */
  readonly createClock: (initialIso: string) => ClockPort;
}

/** Behaviour every `ClockPort` implementation must provide. */
export function describeClockPortContract(options: ClockPortContractOptions): void {
  describe('ClockPort contract', () => {
    it('returns a strict ISO-8601 UTC timestamp', () => {
      const clock = options.createClock('2026-09-18T10:00:00.000Z');
      const now = clock.now();

      expect(now).toMatch(ISO_UTC_PATTERN);
      expect(Number.isNaN(Date.parse(now))).toBe(false);
    });
  });
}
