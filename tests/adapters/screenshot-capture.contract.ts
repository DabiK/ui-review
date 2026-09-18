import { describe, expect, it } from 'vitest';
import type { CapturedImage, ScreenshotCapturePort, ScreenshotCaptureRequest } from '@core';

export type ScreenshotCaptureScenario = 'success' | 'element-offscreen' | 'capture-unavailable';

export interface ScreenshotCapturePortContractOptions {
  /** Returns an adapter that will produce the requested scenario. */
  readonly createPort: (scenario: ScreenshotCaptureScenario) => ScreenshotCapturePort;
}

const VISIBLE_REQUEST: ScreenshotCaptureRequest = {
  tabId: 1,
  rect: { x: 100, y: 80, width: 200, height: 120 },
  viewport: { width: 1200, height: 800 },
};

const OFFSCREEN_REQUEST: ScreenshotCaptureRequest = {
  tabId: 1,
  rect: { x: 5000, y: 80, width: 200, height: 120 },
  viewport: { width: 1200, height: 800 },
};

const SCENARIOS: readonly ScreenshotCaptureScenario[] = [
  'success',
  'element-offscreen',
  'capture-unavailable',
];

function expectCapturedImage(image: CapturedImage | null): void {
  expect(image).not.toBeNull();
  if (image === null) {
    return;
  }

  expect(image.dataUrl).toMatch(/^data:image\//);
  expect(image.mimeType).toMatch(/^image\//);
  expect(Number.isInteger(image.width) && image.width > 0).toBe(true);
  expect(Number.isInteger(image.height) && image.height > 0).toBe(true);
  expect(image.byteLength).toBeGreaterThanOrEqual(0);
}

/** Behaviour every `ScreenshotCapturePort` implementation must provide. */
export function describeScreenshotCapturePortContract(
  options: ScreenshotCapturePortContractOptions,
): void {
  describe('ScreenshotCapturePort contract', () => {
    it('returns both images and no reason when the element is visible', async () => {
      const outcome = await options.createPort('success').capture(VISIBLE_REQUEST);

      expect(outcome.failureReason).toBeNull();
      expectCapturedImage(outcome.viewport);
      expectCapturedImage(outcome.elementCrop);
    });

    it('keeps the viewport and explains the missing crop when the element is offscreen', async () => {
      const outcome = await options.createPort('element-offscreen').capture(OFFSCREEN_REQUEST);

      expectCapturedImage(outcome.viewport);
      expect(outcome.elementCrop).toBeNull();
      expect(outcome.failureReason?.trim()).toBeTruthy();
    });

    it('reports a missing capture with no images and a reason', async () => {
      const outcome = await options.createPort('capture-unavailable').capture(VISIBLE_REQUEST);

      expect(outcome.viewport).toBeNull();
      expect(outcome.elementCrop).toBeNull();
      expect(outcome.failureReason?.trim()).toBeTruthy();
    });

    it('resolves instead of throwing for every scenario', async () => {
      for (const scenario of SCENARIOS) {
        await expect(options.createPort(scenario).capture(VISIBLE_REQUEST)).resolves.toBeDefined();
      }
    });
  });
}
