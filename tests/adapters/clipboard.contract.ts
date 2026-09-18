import { describe, expect, it } from 'vitest';
import type { ClipboardPort } from '@core';

export interface ClipboardHarness {
  readonly port: ClipboardPort;
  /** Text of the last successful write, or `null` when nothing was written. */
  writtenText(): string | null;
}

export interface ClipboardPortContractOptions {
  readonly createHarness: () => ClipboardHarness;
  readonly createFailingHarness: () => ClipboardHarness;
}

/** Behaviour every `ClipboardPort` implementation must provide. */
export function describeClipboardPortContract(options: ClipboardPortContractOptions): void {
  describe('ClipboardPort contract', () => {
    it('writes plain text and reports success', async () => {
      const harness = options.createHarness();

      const result = await harness.port.writeText('agent brief');

      expect(result).toEqual({ ok: true });
      expect(harness.writtenText()).toBe('agent brief');
    });

    it('reports an unavailable clipboard as a typed failure without throwing', async () => {
      const harness = options.createFailingHarness();

      const result = await harness.port.writeText('agent brief');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('clipboard-unavailable');
        expect(result.message.trim().length).toBeGreaterThan(0);
      }
      expect(harness.writtenText()).toBeNull();
    });
  });
}
