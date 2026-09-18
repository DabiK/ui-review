import type { CommentId, EvidenceId, AttachmentId } from './ids';
import { DomainValidationError } from './errors';
import { assertIsoTimestamp, assertNonBlank, assertPositiveInteger } from './invariants';
import { sanitizeDomAnchor } from './redaction';

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

/** `captured` means the image exists; `failed` records why it does not. */
export type VisualCaptureStatus = 'captured' | 'failed';

/**
 * Outcome of the screenshot capture attached to one comment. It never silently claims a
 * screenshot exists: a missing image is an explicit `failed` status with a reason.
 */
export interface VisualEvidence {
  readonly type: 'visual';
  readonly viewport: VisualCaptureStatus;
  readonly elementCrop: VisualCaptureStatus;
  /** Non-blank explanation whenever at least one capture failed; `null` otherwise. */
  readonly reason: string | null;
}

export type EvidencePayload = DomEvidence | FrameworkEvidence | SourceMapEvidence | VisualEvidence;

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

export const ATTACHMENT_KINDS = [
  'viewport-screenshot',
  'element-crop',
] as const satisfies readonly AttachmentKind[];

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

/** The DOM anchor measured on the page, without the evidence envelope. */
export type DomAnchor = Omit<DomEvidence, 'type'>;

export interface CreateAttachmentInput {
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

/** Assembles one attachment so callers never build an invalid binary reference by hand. */
export function createAttachment(input: CreateAttachmentInput): Attachment {
  const mimeType = assertNonBlank(input.mimeType, 'mimeType');
  if (!mimeType.startsWith('image/')) {
    throw new DomainValidationError('mimeType', 'mimeType must describe an image');
  }

  return {
    id: assertNonBlank(input.id, 'id'),
    commentId: assertNonBlank(input.commentId, 'commentId'),
    kind: assertAttachmentKind(input.kind),
    mimeType,
    width: assertPositiveInteger(input.width, 'width'),
    height: assertPositiveInteger(input.height, 'height'),
    byteLength: assertNonNegativeInteger(input.byteLength, 'byteLength'),
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt'),
    storage: assertAttachmentStorage(input.storage),
  };
}

export interface CreateEvidenceInput {
  readonly id: EvidenceId;
  readonly commentId: CommentId;
  readonly capturedAt: string;
  readonly confidence: Confidence;
  readonly payload: EvidencePayload;
}

/**
 * Assembles one piece of evidence so callers never build the envelope by hand. The payload
 * shape decides which fields are validated, and DOM payloads always pass through the
 * privacy redaction gate.
 */
export function createEvidence(input: CreateEvidenceInput): Evidence {
  const id = assertNonBlank(input.id, 'id');
  const commentId = assertNonBlank(input.commentId, 'commentId');
  const capturedAt = assertIsoTimestamp(input.capturedAt, 'capturedAt');

  return {
    id,
    commentId,
    confidence: input.confidence,
    capturedAt,
    payload: assertEvidencePayload(input.payload),
  };
}

function assertEvidencePayload(payload: EvidencePayload): EvidencePayload {
  switch (payload.type) {
    case 'dom':
      return { type: 'dom', ...sanitizeDomAnchor(assertDomEvidence(payload)) };
    case 'visual':
      return assertVisualEvidence(payload);
    case 'framework':
    case 'source-map':
      return payload;
  }
}

function assertVisualEvidence(value: VisualEvidence): VisualEvidence {
  const viewport = assertCaptureStatus(value.viewport, 'viewport');
  const elementCrop = assertCaptureStatus(value.elementCrop, 'elementCrop');
  const capturedEverything = viewport === 'captured' && elementCrop === 'captured';

  if (capturedEverything) {
    if (value.reason !== null) {
      throw new DomainValidationError(
        'reason',
        'reason must be null when both screenshots were captured',
      );
    }
    return { type: 'visual', viewport, elementCrop, reason: null };
  }

  return {
    type: 'visual',
    viewport,
    elementCrop,
    reason: assertNonBlank(value.reason ?? '', 'reason'),
  };
}

function assertCaptureStatus(value: string, field: string): VisualCaptureStatus {
  if (value !== 'captured' && value !== 'failed') {
    throw new DomainValidationError(field, `${field} must be captured or failed`);
  }
  return value;
}

function assertAttachmentKind(value: string): AttachmentKind {
  const kind = ATTACHMENT_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) {
    throw new DomainValidationError('kind', 'kind must be a known attachment kind');
  }
  return kind;
}

function assertAttachmentStorage(value: AttachmentStorage): AttachmentStorage {
  if (value.type === 'inline-data-url') {
    if (!value.dataUrl.startsWith('data:image/')) {
      throw new DomainValidationError('storage.dataUrl', 'dataUrl must be an inline image');
    }
    return { type: 'inline-data-url', dataUrl: value.dataUrl };
  }
  return { type: 'local-artifact', path: assertNonBlank(value.path, 'storage.path') };
}

function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(field, `${field} must be a non-negative integer`);
  }
  return value;
}

export interface CreateDomEvidenceInput {
  readonly id: EvidenceId;
  readonly commentId: CommentId;
  readonly capturedAt: string;
  readonly anchor: DomAnchor;
  readonly confidence?: Confidence;
}

/** Creates the direct DOM observation captured when a reviewer pins an element. */
export function createDomEvidence(input: CreateDomEvidenceInput): Evidence {
  return createEvidence({
    id: input.id,
    commentId: input.commentId,
    capturedAt: input.capturedAt,
    confidence: input.confidence ?? 'confirmed',
    payload: { type: 'dom', ...input.anchor },
  });
}

function assertDomEvidence(value: DomEvidence): DomEvidence {
  return {
    type: 'dom',
    fingerprint: assertNonBlank(value.fingerprint, 'fingerprint'),
    ancestry: [...value.ancestry],
    text: value.text,
    role: value.role,
    accessibleName: value.accessibleName,
    attributes: { ...value.attributes },
    boundingBox: assertRect(value.boundingBox, 'boundingBox'),
    viewport: {
      width: assertPositiveInteger(value.viewport.width, 'viewport.width'),
      height: assertPositiveInteger(value.viewport.height, 'viewport.height'),
    },
    computedStyles: { ...value.computedStyles },
  };
}

function assertRect(value: Rect, field: string): Rect {
  return {
    x: assertFiniteNumber(value.x, `${field}.x`),
    y: assertFiniteNumber(value.y, `${field}.y`),
    width: assertNonNegativeNumber(value.width, `${field}.width`),
    height: assertNonNegativeNumber(value.height, `${field}.height`),
  };
}

function assertFiniteNumber(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new DomainValidationError(field, `${field} must be a finite number`);
  }
  return value;
}

function assertNonNegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainValidationError(field, `${field} must be a non-negative number`);
  }
  return value;
}
