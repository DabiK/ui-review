import { describe, expect, it } from 'vitest';
import type { ActivePageInfo, ActivePagePort } from '@core';

export interface ActivePagePortContractOptions {
  /** Returns an adapter that will report the given page, or none when `null`. */
  readonly createAdapter: (page: ActivePageInfo | null) => ActivePagePort;
}

/** Behaviour every `ActivePagePort` implementation must provide. */
export function describeActivePagePortContract(options: ActivePagePortContractOptions): void {
  describe('ActivePagePort contract', () => {
    it('returns the url and title of the focused page', async () => {
      const adapter = options.createAdapter({
        url: 'https://example.com/pricing',
        title: 'Pricing',
      });

      expect(await adapter.read()).toEqual({
        url: 'https://example.com/pricing',
        title: 'Pricing',
      });
    });

    it('returns null when no page is available', async () => {
      expect(await options.createAdapter(null).read()).toBeNull();
    });

    it('never hands out live references', async () => {
      const adapter = options.createAdapter({ url: 'https://example.com/', title: 'Home' });
      const first = await adapter.read();
      if (first === null) {
        throw new Error('expected a page to be returned');
      }
      (first as { title: string }).title = 'mutated';

      expect((await adapter.read())?.title).toBe('Home');
    });
  });
}
