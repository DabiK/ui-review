import { describe, expect, it } from 'vitest';
import type { IdGeneratorPort } from '@core';

export interface IdGeneratorPortContractOptions {
  readonly createGenerator: () => IdGeneratorPort;
}

/** Behaviour every `IdGeneratorPort` implementation must provide. */
export function describeIdGeneratorPortContract(options: IdGeneratorPortContractOptions): void {
  describe('IdGeneratorPort contract', () => {
    it('creates non-blank, unique ids', () => {
      const generator = options.createGenerator();
      const ids = new Set<string>();

      for (let index = 0; index < 100; index += 1) {
        const id = generator.createId();
        expect(id.trim().length).toBeGreaterThan(0);
        ids.add(id);
      }

      expect(ids.size).toBe(100);
    });
  });
}
