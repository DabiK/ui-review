import type { ClipboardPort, ClipboardWriteResult } from '@core';

const UNAVAILABLE_MESSAGE = 'The system clipboard is not available in this context.';

/**
 * Production `ClipboardPort` backed by the Clipboard API. The side panel has a user gesture
 * and the manifest declares `clipboardWrite`; any refusal becomes a typed failure the panel
 * can show instead of an unhandled rejection.
 */
export class NavigatorClipboardAdapter implements ClipboardPort {
  async writeText(text: string): Promise<ClipboardWriteResult> {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      return { ok: false, reason: 'clipboard-unavailable', message: UNAVAILABLE_MESSAGE };
    }

    try {
      await clipboard.writeText(text);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: 'clipboard-unavailable',
        message:
          error instanceof Error && error.message.length > 0
            ? `The clipboard could not be written: ${error.message}`
            : 'The clipboard could not be written.',
      };
    }
  }
}
