import type { ClockPort } from '@core';

/** Production clock: reads the host's current instant. */
export class SystemClockAdapter implements ClockPort {
  now(): string {
    return new Date().toISOString();
  }
}
