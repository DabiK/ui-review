import type { ClipboardPort, ClipboardWriteResult } from '@core';

export interface InMemoryClipboardOptions {
  /** When set, every write fails with this message until it is cleared. */
  readonly failureMessage?: string;
}

/**
 * Portable `ClipboardPort` used by tests and previews. It records the exact text that would
 * have reached the system clipboard and can be scripted to fail, so the export use case is
 * testable without a browser.
 */
export class InMemoryClipboardAdapter implements ClipboardPort {
  private text: string | null = null;
  private failureMessage: string | null;

  constructor(options: InMemoryClipboardOptions = {}) {
    this.failureMessage = options.failureMessage ?? null;
  }

  async writeText(text: string): Promise<ClipboardWriteResult> {
    if (this.failureMessage !== null) {
      return { ok: false, reason: 'clipboard-unavailable', message: this.failureMessage };
    }
    this.text = text;
    return { ok: true };
  }

  /** Exact text of the last successful write, or `null` when nothing was written. */
  lastWrittenText(): string | null {
    return this.text;
  }

  setFailureMessage(message: string | null): void {
    this.failureMessage = message;
  }
}
