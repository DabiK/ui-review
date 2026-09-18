import type {
  CapturedImage,
  ScreenshotCaptureOutcome,
  ScreenshotCapturePort,
  ScreenshotCaptureRequest,
} from '@core';

/** A realistic 1x1 transparent PNG encoded as an inline data URL. */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Decoded size of {@link TINY_PNG_DATA_URL}. */
export const TINY_PNG_BYTE_LENGTH = 70;

/** Builds a captured image backed by {@link TINY_PNG_DATA_URL}. */
export function createTinyCapturedImage(overrides: Partial<CapturedImage> = {}): CapturedImage {
  return {
    dataUrl: TINY_PNG_DATA_URL,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteLength: TINY_PNG_BYTE_LENGTH,
    ...overrides,
  };
}

/** Default outcome: an explicit failure so an unconfigured fake never pretends to capture. */
export const DEFAULT_FAKE_SCREENSHOT_OUTCOME: ScreenshotCaptureOutcome = {
  viewport: null,
  elementCrop: null,
  failureReason: 'No screenshot was configured.',
};

export interface FakeScreenshotCaptureOptions {
  readonly outcome?: ScreenshotCaptureOutcome;
  readonly onCapture?: (request: ScreenshotCaptureRequest) => void;
}

/** Scriptable test double: returns defensive copies of the outcome configured by the test. */
export class FakeScreenshotCaptureAdapter implements ScreenshotCapturePort {
  private outcome: ScreenshotCaptureOutcome;
  private onCapture: ((request: ScreenshotCaptureRequest) => void) | null;

  constructor(options: FakeScreenshotCaptureOptions = {}) {
    this.outcome = options.outcome ?? DEFAULT_FAKE_SCREENSHOT_OUTCOME;
    this.onCapture = options.onCapture ?? null;
  }

  setOutcome(outcome: ScreenshotCaptureOutcome): void {
    this.outcome = outcome;
  }

  setOnCapture(onCapture: ((request: ScreenshotCaptureRequest) => void) | null): void {
    this.onCapture = onCapture;
  }

  async capture(request: ScreenshotCaptureRequest): Promise<ScreenshotCaptureOutcome> {
    this.onCapture?.(request);
    return copyOutcome(this.outcome);
  }
}

function copyOutcome(outcome: ScreenshotCaptureOutcome): ScreenshotCaptureOutcome {
  return {
    viewport: copyImage(outcome.viewport),
    elementCrop: copyImage(outcome.elementCrop),
    failureReason: outcome.failureReason,
  };
}

function copyImage(image: CapturedImage | null): CapturedImage | null {
  return image === null ? null : { ...image };
}
