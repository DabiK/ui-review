import { describe, expect, it } from 'vitest';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { describeActivePagePortContract } from './active-page.contract';

describeActivePagePortContract({
  createAdapter: (page) => new StaticActivePageAdapter(page),
});

describe('StaticActivePageAdapter', () => {
  it('can be repointed at another page or at none', async () => {
    const adapter = new StaticActivePageAdapter({ url: 'https://example.com/', title: 'Home' });

    adapter.setPage({ url: 'https://example.com/pricing', title: 'Pricing' });
    expect(await adapter.read()).toEqual({
      url: 'https://example.com/pricing',
      title: 'Pricing',
    });

    adapter.setPage(null);
    expect(await adapter.read()).toBeNull();
  });
});
