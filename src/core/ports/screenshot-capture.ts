import type { Rect, Viewport } from '../model/evidence';

/**
 * A captured image ready to become a comment attachment. The core never decodes bytes:
 * it only validates the dimensions declared by the capture adapter.
 */
export interface CapturedImage {
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

export interface ScreenshotCaptureRequest {
  /** Browser tab to capture; the adapter resolves the hosting window itself. */
  readonly tabId: number;
  /** Viewport-relative box of the pinned element, in CSS pixels. */
  readonly rect: Rect;
  readonly viewport: Viewport;
}

/**
 * Outcome of one capture attempt. Implementations never throw for expected failures: a
 * missing image is reported through `null` plus an explicit human-readable reason so the
 * comment stays usable without pretending the evidence exists.
 */
export interface ScreenshotCaptureOutcome {
  readonly viewport: CapturedImage | null;
  readonly elementCrop: CapturedImage | null;
  /** Explanation shown to the reviewer when at least one image is missing. */
  readonly failureReason: string | null;
}

/**
 * Driven port: turns a pinned element into local visual evidence. Implementations must
 * never send pixels anywhere; screenshots stay on the machine.
 */
export interface ScreenshotCapturePort {
  capture(request: ScreenshotCaptureRequest): Promise<ScreenshotCaptureOutcome>;
}
