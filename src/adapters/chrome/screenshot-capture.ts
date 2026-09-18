import type {
  CapturedImage,
  Rect,
  ScreenshotCaptureOutcome,
  ScreenshotCapturePort,
  ScreenshotCaptureRequest,
  Viewport,
} from '@core';

const CAPTURE_FAILED_REASON = 'The visible page could not be captured.';
const CROP_FAILED_REASON = 'The element crop could not be created.';
const OFFSCREEN_REASON = 'The pinned element is outside the visible area.';

export interface CropRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComputeCropRectInput {
  readonly rect: Rect;
  readonly viewport: Viewport;
  readonly image: { readonly width: number; readonly height: number };
}

/**
 * Maps a viewport-relative box to the pixels of the captured bitmap. Captures are scaled by
 * the device pixel ratio, so the CSS rectangle is scaled and clamped before it can be drawn.
 * Returns `null` when the visible part is smaller than one pixel (element fully offscreen).
 */
export function computeCropRect(input: ComputeCropRectInput): CropRectangle | null {
  const { rect, viewport, image } = input;
  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const scaleX = image.width / viewport.width;
  const scaleY = image.height / viewport.height;
  const left = Math.max(0, Math.round(rect.x * scaleX));
  const top = Math.max(0, Math.round(rect.y * scaleY));
  const right = Math.min(image.width, Math.round((rect.x + rect.width) * scaleX));
  const bottom = Math.min(image.height, Math.round((rect.y + rect.height) * scaleY));
  const width = right - left;
  const height = bottom - top;

  if (width < 1 || height < 1) {
    return null;
  }

  return { x: left, y: top, width, height };
}

/**
 * Production adapter: captures the visible tab through `chrome.tabs` and crops the pinned
 * element locally. Pixels never leave the machine: the decoded bitmap is drawn to an
 * `OffscreenCanvas` and only data URLs are returned to the core.
 */
export class ChromeScreenshotCaptureAdapter implements ScreenshotCapturePort {
  async capture(request: ScreenshotCaptureRequest): Promise<ScreenshotCaptureOutcome> {
    let dataUrl: string;
    try {
      const tab = await chrome.tabs.get(request.tabId);
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    } catch {
      return failure(null, CAPTURE_FAILED_REASON);
    }

    let sourceBlob: Blob;
    try {
      sourceBlob = decodeDataUrl(dataUrl);
    } catch {
      return failure(null, CROP_FAILED_REASON);
    }

    let bitmap: ImageBitmap | null = null;
    let viewportImage: CapturedImage | null = null;
    try {
      bitmap = await createImageBitmap(sourceBlob);
      viewportImage = {
        dataUrl,
        mimeType: 'image/png',
        width: bitmap.width,
        height: bitmap.height,
        byteLength: sourceBlob.size,
      };

      const crop = computeCropRect({
        rect: request.rect,
        viewport: request.viewport,
        image: { width: bitmap.width, height: bitmap.height },
      });
      if (crop === null) {
        return failure(viewportImage, OFFSCREEN_REASON);
      }

      const cropBlob = await renderCrop(bitmap, crop);
      return {
        viewport: viewportImage,
        elementCrop: {
          dataUrl: await blobToDataUrl(cropBlob),
          mimeType: cropBlob.type.length > 0 ? cropBlob.type : 'image/png',
          width: crop.width,
          height: crop.height,
          byteLength: cropBlob.size,
        },
        failureReason: null,
      };
    } catch {
      return failure(viewportImage, CROP_FAILED_REASON);
    } finally {
      if (bitmap !== null && typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }
}

function failure(viewport: CapturedImage | null, reason: string): ScreenshotCaptureOutcome {
  return { viewport, elementCrop: null, failureReason: reason };
}

/** Decodes an inline base64 data URL; throws for anything that is not base64 image data. */
function decodeDataUrl(dataUrl: string): Blob {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (match === null) {
    throw new Error('Only base64 data URLs can be decoded.');
  }

  const binary = atob(match[2] ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: match[1] ?? 'image/png' });
}

async function renderCrop(bitmap: ImageBitmap, crop: CropRectangle): Promise<Blob> {
  const canvas = new OffscreenCanvas(crop.width, crop.height);
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('A 2D canvas context is required to crop the capture.');
  }

  context.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return canvas.convertToBlob({ type: 'image/png' });
}

/** Encodes a blob as an inline data URL, chunking so large captures never blow the stack. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  const mimeType = blob.type.length > 0 ? blob.type : 'image/png';
  return `data:${mimeType};base64,${btoa(binary)}`;
}
