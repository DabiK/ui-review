import { describe, expect, it, vi } from 'vitest';
import { InMemoryReviewChangeBus } from '@adapters/runtime/in-memory-review-change-bus';

describe('InMemoryReviewChangeBus', () => {
  it('notifies subscribers until they unsubscribe', () => {
    const bus = new InMemoryReviewChangeBus();
    const listener = vi.fn();

    const unsubscribe = bus.subscribe(listener);
    bus.notifyPanelChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.panelNotifications).toBe(1);

    unsubscribe();
    bus.notifyPanelChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.panelNotifications).toBe(2);
  });

  it('records the pages asked to re-sync their overlay', () => {
    const bus = new InMemoryReviewChangeBus();

    bus.syncPageOverlay('https://example.com/pricing');
    bus.syncPageOverlay('https://example.com/pricing');

    expect(bus.syncedPages).toEqual([
      'https://example.com/pricing',
      'https://example.com/pricing',
    ]);
  });
});
