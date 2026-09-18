import type { IdGeneratorPort } from '@core';

/** Deterministic id generator used by tests: `prefix-1`, `prefix-2`, … */
export class SequentialIdGeneratorAdapter implements IdGeneratorPort {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  createId(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
