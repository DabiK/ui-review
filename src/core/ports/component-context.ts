import type { FrameworkObservation } from '../model/evidence';

/**
 * Where the pinned element lives, as known by the transport. The fingerprint is the stable
 * DOM selector already stored in the DOM anchor: adapters resolve it inside the page before
 * reading any framework metadata.
 */
export interface ComponentContextRequest {
  readonly tabId: number;
  /** Specific frame when the content script reported one; `null` targets the tab main frame. */
  readonly frameId: number | null;
  readonly fingerprint: string;
}

/**
 * Best-effort component context of a pinned element. Implementations resolve with an
 * explicit `unavailable` observation instead of throwing: framework context enriches a
 * review but must never block it.
 */
export interface ComponentContextPort {
  detect(request: ComponentContextRequest): Promise<FrameworkObservation>;
}
