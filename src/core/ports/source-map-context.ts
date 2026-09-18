import type { SourceReference } from '../model/evidence';

/**
 * A compiled location observed by a framework adapter and the page it belongs to. Relative
 * references resolve against `pageUrl`. Requests are only ever issued while a review capture
 * is running, so source-map fetching follows the explicit active-review permission model.
 */
export interface SourceMapContextRequest {
  readonly pageUrl: string;
  readonly reference: SourceReference;
}

/**
 * Facts returned by a resolver. The adapter says what it found (`mapped`) or why it could
 * not (`unavailable`); the core owns the confidence mapping and re-validates everything.
 */
export type SourceMapResolution =
  | {
      readonly kind: 'mapped';
      readonly sourceFile: string;
      readonly line: number | null;
      readonly column: number | null;
      /** Non-blank explanation of how the position was resolved. */
      readonly reason: string;
    }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Resolves a compiled source location to an original source reference through the source map
 * published next to it. Implementations never throw: a missing, inaccessible or invalid map
 * is an explicit `unavailable` result so annotation never depends on a source map.
 */
export interface SourceMapContextPort {
  resolve(request: SourceMapContextRequest): Promise<SourceMapResolution>;
}
