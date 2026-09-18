/**
 * Driven port: the system clipboard. The side panel must never call
 * `navigator.clipboard` itself — copying the agent brief is a use-case outcome with an
 * explicit success or failure, and the port keeps the UI testable without a browser.
 * Expected failures are typed values, never thrown errors.
 */
export type ClipboardWriteResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'clipboard-unavailable';
      readonly message: string;
    };

export interface ClipboardPort {
  /** Writes plain text to the clipboard; the caller decides what to show on failure. */
  writeText(text: string): Promise<ClipboardWriteResult>;
}
