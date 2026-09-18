import { assertIsoTimestamp, type ClockPort } from '@core';

/** Deterministic clock used by tests and local previews; movable with `set()`. */
export class FixedClockAdapter implements ClockPort {
  private current: string;

  constructor(initial: string) {
    this.current = assertIsoTimestamp(initial, 'initial');
  }

  now(): string {
    return this.current;
  }

  set(instant: string): void {
    this.current = assertIsoTimestamp(instant, 'instant');
  }
}
