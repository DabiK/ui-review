import type { CommentId, EvidenceId, AttachmentId } from './ids';

/**
 * Confidence attached to every piece of captured evidence.
 * `confirmed` means directly observed; `inferred` means best-effort; `unavailable` is an
 * explicit failure rather than misleading data.
 */
export type Confidence = 'confirmed' | 'inferred' | 'unavailable';

export const CONFIDENCE_LEVELS = [
  'confirmed',
  'inferred',
  'unavailable',
] as const satisfies readonly Confidence[];

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DomEvidence {
  readonly type: 'dom';
  readonly fingerprint: string;
  readonly ancestry: readonly string[];
  readonly text: string;
  readonly role: string | null;
  readonly accessibleName: string | null;
  readonly attributes: Readonly<Record<string, string>>;
  readonly boundingBox: Rect;
  readonly viewport: Viewport;
  readonly computedStyles: Readonly<Record<string, string>>;
}

export interface FrameworkEvidence {
  readonly type: 'framework';
  readonly framework: 'react' | 'vue' | 'unknown';
  readonly componentName: string | null;
  readonly componentChain: readonly string[];
}

export interface SourceMapEvidence {
  readonly type: 'source-map';
  readonly sourceFile: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly reason: string | null;
}

export type EvidencePayload = DomEvidence | FrameworkEvidence | SourceMapEvidence;

/**
 * Technical context captured for one review comment. Evidence is always linked to its
 * comment by id and always carries an explicit confidence level.
 */
export interface Evidence {
  readonly id: EvidenceId;
  readonly commentId: CommentId;
  readonly confidence: Confidence;
  readonly capturedAt: string;
  readonly payload: EvidencePayload;
}

export type AttachmentKind = 'viewport-screenshot' | 'element-crop';

/**
 * Where the bytes of an attachment live. `inline-data-url` keeps them inside the local
 * session store; `local-artifact` points at a file materialized by the native bridge.
 */
export type AttachmentStorage =
  | { readonly type: 'inline-data-url'; readonly dataUrl: string }
  | { readonly type: 'local-artifact'; readonly path: string };

export interface Attachment {
  readonly id: AttachmentId;
  readonly commentId: CommentId;
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly createdAt: string;
  readonly storage: AttachmentStorage;
}
