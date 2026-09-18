/**
 * The page the reviewer is currently looking at, as reported by the host.
 * Adapters own the host APIs (Chrome tab query, static test double); the core only sees
 * this port and never `chrome.tabs`.
 */
export interface ActivePageInfo {
  readonly url: string;
  readonly title: string;
}

export interface ActivePagePort {
  /** Returns the focused page, or `null` when the host has none (restricted window…). */
  read(): Promise<ActivePageInfo | null>;
}
