import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScreenshotCaptureOutcome, ScreenshotCaptureRequest } from '@core';
import {
  ChromeScreenshotCaptureAdapter,
  computeCropRect,
} from '@adapters/chrome/screenshot-capture';
import {
  createTinyCapturedImage,
  FakeScreenshotCaptureAdapter,
  TINY_PNG_DATA_URL,
} from '@adapters/runtime/fake-screenshot-capture';
import {
  describeScreenshotCapturePortContract,
  type ScreenshotCaptureScenario,
} from './screenshot-capture.contract';

const CAPTURE_FAILED = 'The visible page could not be captured.';
const CROP_FAILED = 'The element crop could not be created.';
const OFFSCREEN = 'The pinned element is outside the visible area.';

const REQUEST: ScreenshotCaptureRequest = {
  tabId: 1,
  rect: { x: 100, y: 80, width: 200, height: 120 },
  viewport: { width: 1200, height: 800 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeOutcome(scenario: ScreenshotCaptureScenario): ScreenshotCaptureOutcome {
  switch (scenario) {
    case 'success':
      return {
        viewport: createTinyCapturedImage(),
        elementCrop: createTinyCapturedImage(),
        failureReason: null,
      };
    case 'element-offscreen':
      return {
        viewport: createTinyCapturedImage(),
        elementCrop: null,
        failureReason: OFFSCREEN,
      };
    case 'capture-unavailable':
      return { viewport: null, elementCrop: null, failureReason: CAPTURE_FAILED };
  }
}

class StubOffscreenCanvas {
  getContext(): { drawImage: () => void } {
    return { drawImage: () => undefined };
  }

  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob(['x'], { type: 'image/png' }));
  }
}

class FailingOffscreenCanvas {
  getContext(): { drawImage: () => void } {
    return { drawImage: () => undefined };
  }

  convertToBlob(): Promise<Blob> {
    return Promise.reject(new Error('canvas is unavailable'));
  }
}

function stubChrome(scenario: ScreenshotCaptureScenario) {
  const get = vi.fn().mockResolvedValue({ windowId: 3 });
  const captureVisibleTab = vi.fn(
    (): Promise<string> =>
      scenario === 'capture-unavailable'
        ? Promise.reject(new Error('capture was rejected'))
        : Promise.resolve(TINY_PNG_DATA_URL),
  );
  vi.stubGlobal('chrome', { tabs: { get, captureVisibleTab } });
  return { get, captureVisibleTab };
}

function stubEnvironment(scenario: ScreenshotCaptureScenario) {
  const chrome = stubChrome(scenario);
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 2400, height: 1600, close }),
  );
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  return { ...chrome, close };
}

describeScreenshotCapturePortContract({
  createPort: (scenario) => new FakeScreenshotCaptureAdapter({ outcome: fakeOutcome(scenario) }),
});

describeScreenshotCapturePortContract({
  createPort: (scenario) => {
    stubEnvironment(scenario);
    return new ChromeScreenshotCaptureAdapter();
  },
});

describe('FakeScreenshotCaptureAdapter', () => {
  it('fails explicitly until an outcome is configured', async () => {
    const outcome = await new FakeScreenshotCaptureAdapter().capture(REQUEST);

    expect(outcome).toEqual({
      viewport: null,
      elementCrop: null,
      failureReason: 'No screenshot was configured.',
    });
  });

  it('never hands out live references to the configured outcome', async () => {
    const adapter = new FakeScreenshotCaptureAdapter({
      outcome: {
        viewport: createTinyCapturedImage({ width: 5 }),
        elementCrop: createTinyCapturedImage(),
        failureReason: null,
      },
    });

    const first = await adapter.capture(REQUEST);
    if (first.viewport === null) {
      throw new Error('expected a viewport image');
    }
    (first.viewport as { width: number }).width = 99;

    expect((await adapter.capture(REQUEST)).viewport?.width).toBe(5);
  });

  it('lets tests record the requests it receives', async () => {
    const onCapture = vi.fn();
    const adapter = new FakeScreenshotCaptureAdapter({ onCapture });

    await adapter.capture(REQUEST);

    expect(onCapture).toHaveBeenCalledWith(REQUEST);
  });

  it('can be repointed at another outcome', async () => {
    const adapter = new FakeScreenshotCaptureAdapter();

    adapter.setOutcome(fakeOutcome('capture-unavailable'));

    expect((await adapter.capture(REQUEST)).viewport).toBeNull();
  });
});

describe('ChromeScreenshotCaptureAdapter', () => {
  it('captures the window hosting the requested tab as PNG', async () => {
    const { get, captureVisibleTab } = stubEnvironment('success');

    await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(get).toHaveBeenCalledWith(REQUEST.tabId);
    expect(captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' });
  });

  it('crops the element from the decoded capture', async () => {
    stubEnvironment('success');

    const outcome = await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(outcome.failureReason).toBeNull();
    expect(outcome.viewport).toMatchObject({
      mimeType: 'image/png',
      width: 2400,
      height: 1600,
      dataUrl: TINY_PNG_DATA_URL,
    });
    expect(outcome.elementCrop).toMatchObject({
      mimeType: 'image/png',
      width: 400,
      height: 240,
      byteLength: 1,
    });
    expect(outcome.elementCrop?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('closes the decoded bitmap', async () => {
    const { close } = stubEnvironment('success');

    await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable capture instead of throwing', async () => {
    stubEnvironment('capture-unavailable');

    const outcome = await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(outcome).toEqual({
      viewport: null,
      elementCrop: null,
      failureReason: CAPTURE_FAILED,
    });
  });

  it('reports an offscreen element while keeping the viewport', async () => {
    stubEnvironment('success');

    const outcome = await new ChromeScreenshotCaptureAdapter().capture({
      ...REQUEST,
      rect: { x: 5000, y: 80, width: 200, height: 120 },
    });

    expect(outcome.viewport).not.toBeNull();
    expect(outcome.elementCrop).toBeNull();
    expect(outcome.failureReason).toBe(OFFSCREEN);
  });

  it('reports a non-base64 capture as a crop failure', async () => {
    const { captureVisibleTab } = stubEnvironment('success');
    captureVisibleTab.mockResolvedValue('data:text/plain,hello');

    const outcome = await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(outcome.viewport).toBeNull();
    expect(outcome.elementCrop).toBeNull();
    expect(outcome.failureReason).toBe(CROP_FAILED);
  });

  it('keeps the viewport when the canvas cannot crop', async () => {
    stubEnvironment('success');
    vi.stubGlobal('OffscreenCanvas', FailingOffscreenCanvas);

    const outcome = await new ChromeScreenshotCaptureAdapter().capture(REQUEST);

    expect(outcome.viewport).not.toBeNull();
    expect(outcome.elementCrop).toBeNull();
    expect(outcome.failureReason).toBe(CROP_FAILED);
  });
});

describe('computeCropRect', () => {
  const viewport = { width: 1000, height: 500 };

  it('scales the rect from CSS pixels to image pixels', () => {
    expect(
      computeCropRect({
        rect: { x: 100, y: 50, width: 200, height: 100 },
        viewport,
        image: { width: 2000, height: 1000 },
      }),
    ).toEqual({ x: 200, y: 100, width: 400, height: 200 });
  });

  it('clamps a partially offscreen element to the image bounds', () => {
    expect(
      computeCropRect({
        rect: { x: -50, y: -20, width: 200, height: 100 },
        viewport,
        image: { width: 1000, height: 500 },
      }),
    ).toEqual({ x: 0, y: 0, width: 150, height: 80 });
  });

  it('clamps an element that overflows the far edge', () => {
    expect(
      computeCropRect({
        rect: { x: 950, y: 450, width: 100, height: 100 },
        viewport,
        image: { width: 1000, height: 500 },
      }),
    ).toEqual({ x: 950, y: 450, width: 50, height: 50 });
  });

  it('returns null for an element entirely outside the viewport', () => {
    expect(
      computeCropRect({
        rect: { x: 1500, y: 50, width: 100, height: 100 },
        viewport,
        image: { width: 1000, height: 500 },
      }),
    ).toBeNull();

    expect(
      computeCropRect({
        rect: { x: -300, y: 50, width: 100, height: 100 },
        viewport,
        image: { width: 2000, height: 1000 },
      }),
    ).toBeNull();
  });

  it('tolerates a captured image slightly smaller than viewport × dpr', () => {
    expect(
      computeCropRect({
        rect: { x: 0, y: 0, width: 1000, height: 500 },
        viewport,
        image: { width: 1999, height: 999 },
      }),
    ).toEqual({ x: 0, y: 0, width: 1999, height: 999 });
  });
});
