import { decodeBase64 } from '../bridge/base64';
import { isSafeArtifactName, isSafeArtifactSessionId } from '../bridge/slug';
import type { Confidence } from '../model/evidence';
import { assertIsoTimestamp, assertNonBlank } from '../model/invariants';
import type { CommentCategory, CommentPriority, ReviewComment } from '../model/review-comment';
import type { ReviewSession, SessionStatus } from '../model/review-session';

/**
 * Agent handoff brief: the versioned brief materialized as `review.json`, the Markdown
 * brief materialized as `review.md`, and the image files referenced by both.
 *
 * This module is pure domain code shared by the extension and the native bridge: the
 * extension builds the brief from a persisted session, the bridge re-validates the brief
 * before writing anything, and the same parser proves the exported JSON still matches the
 * documented schema. Writing it here keeps the agent-facing contract independent from the
 * Native Messaging wire protocol.
 */

export const REVIEW_BRIEF_SCHEMA_VERSION = 1;
export const REVIEW_BRIEF_MARKDOWN_FILE = 'review.md';
export const REVIEW_BRIEF_JSON_FILE = 'review.json';

/** Image formats a handoff can materialize; everything else is reported as unavailable. */
export const REVIEW_BRIEF_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ReviewBriefImageMediaType = (typeof REVIEW_BRIEF_IMAGE_MEDIA_TYPES)[number];

export const REVIEW_BRIEF_MAX_FILES = 100;
export const REVIEW_BRIEF_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const REVIEW_BRIEF_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export function isReviewBriefImageMediaType(
  value: unknown,
): value is ReviewBriefImageMediaType {
  return (
    typeof value === 'string' &&
    (REVIEW_BRIEF_IMAGE_MEDIA_TYPES as readonly string[]).includes(value)
  );
}

export interface ReviewBriefSession {
  readonly id: string;
  readonly name: string;
  readonly status: SessionStatus;
  readonly pageUrl: string;
  readonly hostname: string;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
}

export interface ReviewBriefDomEvidence {
  readonly confidence: Confidence;
  readonly fingerprint: string;
  readonly ancestry: readonly string[];
  readonly text: string;
  readonly role: string | null;
  readonly accessibleName: string | null;
  readonly attributes: Readonly<Record<string, string>>;
  readonly boundingBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly computedStyles: Readonly<Record<string, string>>;
}

export interface ReviewBriefFrameworkEvidence {
  readonly confidence: Confidence;
  readonly framework: 'react' | 'vue' | 'unknown';
  readonly componentName: string | null;
  readonly componentChain: readonly string[];
}

export interface ReviewBriefSourceMapEvidence {
  readonly confidence: Confidence;
  readonly sourceFile: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly reason: string | null;
}

export interface ReviewBriefVisualEvidence {
  readonly confidence: Confidence;
  readonly viewport: 'captured' | 'failed';
  readonly elementCrop: 'captured' | 'failed';
  readonly reason: string | null;
}

export interface ReviewBriefEvidence {
  readonly dom: ReviewBriefDomEvidence | null;
  readonly framework: ReviewBriefFrameworkEvidence | null;
  readonly sourceMap: ReviewBriefSourceMapEvidence | null;
  readonly visual: ReviewBriefVisualEvidence | null;
}

export interface ReviewBriefAttachment {
  readonly id: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  /** File name inside the handoff directory; `null` when the image could not be exported. */
  readonly file: string | null;
  /** Non-blank explanation whenever `file` is null. */
  readonly unavailableReason: string | null;
}

export interface ReviewBriefComment {
  /** 1-based position in the brief, stable for a given session state. */
  readonly index: number;
  readonly id: string;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: ReviewBriefEvidence;
  readonly attachments: readonly ReviewBriefAttachment[];
}

export interface ReviewBriefDocument {
  readonly schemaVersion: typeof REVIEW_BRIEF_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly session: ReviewBriefSession;
  readonly comments: readonly ReviewBriefComment[];
}

/** One binary file the handoff materializes next to `review.md`. */
export interface ReviewBriefFile {
  readonly name: string;
  readonly mediaType: ReviewBriefImageMediaType;
  readonly content: Uint8Array;
}

/** The brief and the exact bytes to write; both are assembled by the core, never by callers. */
export interface ReviewBriefBundle {
  readonly brief: ReviewBriefDocument;
  readonly files: readonly ReviewBriefFile[];
}

export interface BuildReviewBriefOptions {
  readonly generatedAt: string;
}

/**
 * Builds the versioned handoff brief and the image files it references. The result is
 * deterministic for a given session state: comments keep their stored order, file names are
 * derived from the comment index and the attachment kind.
 */
export function buildReviewBrief(
  session: ReviewSession,
  options: BuildReviewBriefOptions,
): ReviewBriefBundle {
  const generatedAt = assertIsoTimestamp(options.generatedAt, 'generatedAt');
  const files: ReviewBriefFile[] = [];
  const usedNames = new Set<string>();

  const comments = session.comments.map((comment, position) =>
    toBriefComment(comment, position + 1, files, usedNames),
  );

  return {
    brief: {
      schemaVersion: REVIEW_BRIEF_SCHEMA_VERSION,
      generatedAt,
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        pageUrl: session.pageUrl,
        hostname: session.hostname,
        startedAt: session.startedAt,
        stoppedAt: session.stoppedAt,
      },
      comments,
    },
    files,
  };
}

/**
 * Absolute file paths of one materialized handoff. The bridge plans them (its adapters know
 * the OS temp directory and the platform separator) and the Markdown renderer only reads
 * them, so no path is ever assembled twice.
 */
export interface ReviewBriefPaths {
  readonly directory: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
  readonly filePaths: Readonly<Record<string, string>>;
}

/** Deterministic Markdown brief, written to `review.md` and copied to the clipboard. */
export function renderReviewBriefMarkdown(
  brief: ReviewBriefDocument,
  paths: ReviewBriefPaths,
): string {
  const directory = assertNonBlank(paths.directory, 'paths.directory');
  const markdownPath = assertNonBlank(paths.markdownPath, 'paths.markdownPath');
  const jsonPath = assertNonBlank(paths.jsonPath, 'paths.jsonPath');
  const lines: string[] = [];

  lines.push(
    '# UI Review brief',
    '',
    `- Session: ${brief.session.name}`,
    `- Session ID: ${brief.session.id}`,
    `- Page: ${brief.session.pageUrl}`,
    `- Status: ${brief.session.status}`,
    `- Started: ${brief.session.startedAt}`,
    `- Stopped: ${brief.session.stoppedAt ?? 'not stopped'}`,
    `- Generated: ${brief.generatedAt}`,
    `- Review items: ${brief.comments.length}`,
    '',
    '## Handoff files',
    '',
    `- Brief: ${markdownPath}`,
    `- Machine-readable review: ${jsonPath} (schema version ${REVIEW_BRIEF_SCHEMA_VERSION})`,
    `- Directory: ${directory}`,
    '',
    'The directory is temporary and lives outside the browser profile. Exporting again updates',
    'it in place, so no copies accumulate. The review itself is never modified by the export,',
    'and screenshots stay on this machine. Delete the directory once the agent is done.',
    '',
    '## Instructions for the coding agent',
    '',
    'Work only on the review items listed below. Change the minimum needed for each item and do',
    'not refactor, restyle or fix anything outside their scope.',
    '',
    'For every comment ID, report exactly one result with that same ID. If an item is unclear or',
    'unsafe to change, report it as blocked with a reason instead of guessing.',
    '',
    'Expected response format, one section per comment:',
    '',
    '### <comment ID>',
    '- Status: done | skipped | blocked',
    '- Changes: <files changed, or "none">',
    '- Verification: <command run and result, or "not run">',
    '- Notes: <anything the reviewer must know>',
    '',
    '## Review items',
    '',
  );

  if (brief.comments.length === 0) {
    lines.push('_No review items were recorded._', '');
  }

  for (const comment of brief.comments) {
    pushComment(lines, comment, paths);
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** File names a brief references, in brief order. Used to validate a handoff payload. */
export function collectReviewBriefFileNames(brief: ReviewBriefDocument): string[] {
  const names: string[] = [];
  for (const comment of brief.comments) {
    for (const attachment of comment.attachments) {
      if (attachment.file !== null) {
        names.push(attachment.file);
      }
    }
  }
  return names;
}

/** One image a materialization request wants to write next to the brief. */
export interface ReviewBriefBundleFile {
  readonly name: string;
  readonly mediaType: ReviewBriefImageMediaType;
  readonly content: Uint8Array;
}

/** Failure codes shared by the wire validator and the core export use case. */
export type ReviewBriefValidationCode =
  | 'invalid-brief'
  | 'unsupported-brief-version'
  | 'invalid-session-id'
  | 'invalid-artifact-name'
  | 'unsupported-media-type'
  | 'artifact-too-large';

export interface ReviewBriefValidationFailure {
  readonly ok: false;
  readonly code: ReviewBriefValidationCode;
  readonly message: string;
}

export type ReviewBriefBundleValidation = { readonly ok: true } | ReviewBriefValidationFailure;

export interface ValidateReviewBriefBundleInput {
  readonly sessionId: string;
  readonly brief: ReviewBriefDocument;
  readonly files: readonly ReviewBriefBundleFile[];
  /** Overrides {@link REVIEW_BRIEF_MAX_FILE_BYTES}; used by tests. */
  readonly maxFileBytes?: number;
}

/**
 * Cross-checks a brief and its files: safe path segments, allowlisted image types, size
 * limits, unique names and a one-to-one match between referenced and provided files. Both
 * sides of the bridge run this before anything is written, so a mismatch can never produce a
 * brief that points at a missing image.
 */
export function validateReviewBriefBundle(
  input: ValidateReviewBriefBundleInput,
): ReviewBriefBundleValidation {
  if (input.brief.schemaVersion !== REVIEW_BRIEF_SCHEMA_VERSION) {
    return bundleFailure(
      'unsupported-brief-version',
      `Unsupported review brief schema version ${String(input.brief.schemaVersion)}.`,
    );
  }
  if (!isSafeArtifactSessionId(input.sessionId)) {
    return bundleFailure('invalid-session-id', 'The session id cannot be used as a storage folder.');
  }
  if (input.brief.session.id !== input.sessionId) {
    return bundleFailure(
      'invalid-brief',
      'The review brief brief does not belong to this session.',
    );
  }
  if (input.files.length > REVIEW_BRIEF_MAX_FILES) {
    return bundleFailure(
      'artifact-too-large',
      `The handoff exceeds the ${REVIEW_BRIEF_MAX_FILES} file limit.`,
    );
  }

  const maxFileBytes = input.maxFileBytes ?? REVIEW_BRIEF_MAX_FILE_BYTES;
  const names = new Set<string>();
  let totalBytes = 0;
  for (const file of input.files) {
    if (!isSafeReviewBriefFileName(file.name)) {
      return bundleFailure(
        'invalid-artifact-name',
        `The handoff file name "${file.name}" cannot be used in a directory.`,
      );
    }
    if (names.has(file.name)) {
      return bundleFailure('invalid-brief', 'The handoff file names must be unique.');
    }
    if (!isReviewBriefImageMediaType(file.mediaType)) {
      return bundleFailure(
        'unsupported-media-type',
        'The handoff file media type is not allowlisted.',
      );
    }
    if (file.content.byteLength === 0) {
      return bundleFailure('invalid-brief', 'A handoff file must not be empty.');
    }
    if (file.content.byteLength > maxFileBytes) {
      return bundleFailure(
        'artifact-too-large',
        `A handoff file exceeds the ${maxFileBytes} byte limit.`,
      );
    }
    totalBytes += file.content.byteLength;
    if (totalBytes > REVIEW_BRIEF_MAX_TOTAL_BYTES) {
      return bundleFailure(
        'artifact-too-large',
        `The handoff exceeds the ${REVIEW_BRIEF_MAX_TOTAL_BYTES} byte limit.`,
      );
    }
    names.add(file.name);
  }

  const referenced = collectReviewBriefFileNames(input.brief);
  const referencedNames = new Set(referenced);
  const mismatch =
    referenced.length !== referencedNames.size ||
    referencedNames.size !== names.size ||
    [...referencedNames].some((name) => !names.has(name));
  if (mismatch) {
    return bundleFailure(
      'invalid-brief',
      'The review brief brief and the handoff files do not match.',
    );
  }

  return { ok: true };
}

function bundleFailure(
  code: ReviewBriefValidationCode,
  message: string,
): ReviewBriefValidationFailure {
  return { ok: false, code, message };
}

export type ReviewBriefParseResult =
  | { readonly ok: true; readonly value: ReviewBriefDocument }
  | ParseFailure;

/**
 * Strict, versioned schema validation. The bridge runs it on every materialization request and
 * tests run it on exported JSON, so a brief that stopped matching the documented schema is
 * refused instead of written.
 */
export function parseReviewBriefDocument(value: unknown): ReviewBriefParseResult {
  const top = parseObject(value, 'The review brief must be a JSON object.');
  if (!top.ok) {
    return top;
  }
  if (!hasExactKeys(top.value, ['schemaVersion', 'generatedAt', 'session', 'comments'])) {
    return invalid('The review brief has unknown or missing fields.');
  }
  if (top.value['schemaVersion'] !== REVIEW_BRIEF_SCHEMA_VERSION) {
    return unsupportedVersion(
      `Unsupported review brief schema version ${String(top.value['schemaVersion'])}.`,
    );
  }

  const generatedAt = readString(top.value['generatedAt'], 'generatedAt');
  if (!generatedAt.ok) {
    return generatedAt;
  }
  const session = parseBriefSession(top.value['session']);
  if (!session.ok) {
    return session;
  }
  const commentsValue = top.value['comments'];
  if (!Array.isArray(commentsValue)) {
    return invalid('The review brief comments must be an array.');
  }
  const comments: ReviewBriefComment[] = [];
  for (const [position, rawComment] of commentsValue.entries()) {
    const parsed = parseBriefComment(rawComment, position + 1);
    if (!parsed.ok) {
      return parsed;
    }
    comments.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      schemaVersion: REVIEW_BRIEF_SCHEMA_VERSION,
      generatedAt: generatedAt.value,
      session: session.value,
      comments,
    },
  };
}

function parseBriefSession(value: unknown): ParseStep<ReviewBriefSession> {
  const session = parseObject(value, 'The review brief session must be an object.');
  if (!session.ok) {
    return session;
  }
  if (
    !hasExactKeys(session.value, [
      'id',
      'name',
      'status',
      'pageUrl',
      'hostname',
      'startedAt',
      'stoppedAt',
    ])
  ) {
    return invalid('The review brief session has unknown or missing fields.');
  }

  const id = readString(session.value['id'], 'session.id');
  const name = readString(session.value['name'], 'session.name');
  const status = session.value['status'];
  const pageUrl = readString(session.value['pageUrl'], 'session.pageUrl');
  const hostname = readString(session.value['hostname'], 'session.hostname');
  const startedAt = readString(session.value['startedAt'], 'session.startedAt');
  const stoppedAt = session.value['stoppedAt'];

  if (!id.ok) return id;
  if (!name.ok) return name;
  if (status !== 'active' && status !== 'stopped') {
    return invalid('The review brief session status must be active or stopped.');
  }
  if (!pageUrl.ok) return pageUrl;
  if (!hostname.ok) return hostname;
  if (!startedAt.ok) return startedAt;
  if (stoppedAt !== null && typeof stoppedAt !== 'string') {
    return invalid('The review brief stoppedAt must be a string or null.');
  }
  if (typeof stoppedAt === 'string' && !isIsoTimestamp(stoppedAt)) {
    return invalid('The review brief stoppedAt must be an ISO-8601 UTC timestamp.');
  }
  if (!isHttpUrl(pageUrl.value)) {
    return invalid('The review brief page URL must be an http(s) URL.');
  }
  if (!isIsoTimestamp(startedAt.value)) {
    return invalid('The review brief startedAt must be an ISO-8601 UTC timestamp.');
  }

  return {
    ok: true,
    value: {
      id: id.value,
      name: name.value,
      status,
      pageUrl: pageUrl.value,
      hostname: hostname.value,
      startedAt: startedAt.value,
      stoppedAt: typeof stoppedAt === 'string' ? stoppedAt : null,
    },
  };
}

function parseBriefComment(value: unknown, expectedIndex: number): ParseStep<ReviewBriefComment> {
  const comment = parseObject(value, 'Each review brief comment must be an object.');
  if (!comment.ok) {
    return comment;
  }
  if (
    !hasExactKeys(comment.value, [
      'index',
      'id',
      'text',
      'category',
      'priority',
      'createdAt',
      'updatedAt',
      'evidence',
      'attachments',
    ])
  ) {
    return invalid('A review brief comment has unknown or missing fields.');
  }
  if (comment.value['index'] !== expectedIndex) {
    return invalid('The review brief comment indexes must be sequential starting at 1.');
  }

  const id = readString(comment.value['id'], 'comment.id');
  const text = readString(comment.value['text'], 'comment.text');
  const category = comment.value['category'];
  const priority = comment.value['priority'];
  const createdAt = readString(comment.value['createdAt'], 'comment.createdAt');
  const updatedAt = readString(comment.value['updatedAt'], 'comment.updatedAt');

  if (!id.ok) return id;
  if (!text.ok) return text;
  if (!isCommentCategory(category)) {
    return invalid('A review brief comment has an unknown category.');
  }
  if (!isCommentPriority(priority)) {
    return invalid('A review brief comment has an unknown priority.');
  }
  if (!createdAt.ok) return createdAt;
  if (!updatedAt.ok) return updatedAt;
  if (id.value.trim().length === 0) {
    return invalid('A review brief comment id must not be blank.');
  }
  if (text.value.trim().length === 0) {
    return invalid('A review brief comment text must not be blank.');
  }
  if (!isIsoTimestamp(createdAt.value) || !isIsoTimestamp(updatedAt.value)) {
    return invalid('The review brief comment timestamps must be ISO-8601 UTC timestamps.');
  }

  const evidence = parseBriefEvidence(comment.value['evidence']);
  if (!evidence.ok) {
    return evidence;
  }
  const attachmentsValue = comment.value['attachments'];
  if (!Array.isArray(attachmentsValue)) {
    return invalid('The review brief attachments must be an array.');
  }
  const attachments: ReviewBriefAttachment[] = [];
  for (const rawAttachment of attachmentsValue) {
    const parsed = parseBriefAttachment(rawAttachment);
    if (!parsed.ok) {
      return parsed;
    }
    attachments.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      index: expectedIndex,
      id: id.value,
      text: text.value,
      category,
      priority,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      evidence: evidence.value,
      attachments,
    },
  };
}

function parseBriefEvidence(value: unknown): ParseStep<ReviewBriefEvidence> {
  const evidence = parseObject(value, 'The review brief evidence must be an object.');
  if (!evidence.ok) {
    return evidence;
  }
  if (!hasExactKeys(evidence.value, ['dom', 'framework', 'sourceMap', 'visual'])) {
    return invalid('The review brief evidence has unknown or missing fields.');
  }

  const dom = parseDomEvidence(evidence.value['dom']);
  if (!dom.ok) {
    return dom;
  }
  const framework = parseFrameworkEvidence(evidence.value['framework']);
  if (!framework.ok) {
    return framework;
  }
  const sourceMap = parseSourceMapEvidence(evidence.value['sourceMap']);
  if (!sourceMap.ok) {
    return sourceMap;
  }
  const visual = parseVisualEvidence(evidence.value['visual']);
  if (!visual.ok) {
    return visual;
  }

  return {
    ok: true,
    value: { dom: dom.value, framework: framework.value, sourceMap: sourceMap.value, visual: visual.value },
  };
}

function parseDomEvidence(value: unknown): ParseStep<ReviewBriefDomEvidence | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  const dom = parseObject(value, 'The DOM evidence must be an object or null.');
  if (!dom.ok) {
    return dom;
  }
  if (
    !hasExactKeys(dom.value, [
      'confidence',
      'fingerprint',
      'ancestry',
      'text',
      'role',
      'accessibleName',
      'attributes',
      'boundingBox',
      'viewport',
      'computedStyles',
    ])
  ) {
    return invalid('The DOM evidence has unknown or missing fields.');
  }

  const confidence = parseConfidence(dom.value['confidence']);
  const fingerprint = readString(dom.value['fingerprint'], 'evidence.dom.fingerprint');
  const ancestry = readStringArray(dom.value['ancestry'], 'evidence.dom.ancestry');
  const text = readString(dom.value['text'], 'evidence.dom.text');
  const role = readNullableString(dom.value['role'], 'evidence.dom.role');
  const accessibleName = readNullableString(dom.value['accessibleName'], 'evidence.dom.accessibleName');
  const attributes = readStringRecord(dom.value['attributes'], 'evidence.dom.attributes');
  const boundingBox = parseRect(dom.value['boundingBox'], 'evidence.dom.boundingBox');
  const viewport = parseViewport(dom.value['viewport'], 'evidence.dom.viewport');
  const computedStyles = readStringRecord(dom.value['computedStyles'], 'evidence.dom.computedStyles');

  if (!confidence.ok) return confidence;
  if (!fingerprint.ok) return fingerprint;
  if (!ancestry.ok) return ancestry;
  if (!text.ok) return text;
  if (!role.ok) return role;
  if (!accessibleName.ok) return accessibleName;
  if (!attributes.ok) return attributes;
  if (!boundingBox.ok) return boundingBox;
  if (!viewport.ok) return viewport;
  if (!computedStyles.ok) return computedStyles;
  if (fingerprint.value.trim().length === 0) {
    return invalid('The DOM evidence fingerprint must not be blank.');
  }
  if (viewport.value.width <= 0 || viewport.value.height <= 0) {
    return invalid('The DOM evidence viewport must be positive.');
  }

  return {
    ok: true,
    value: {
      confidence: confidence.value,
      fingerprint: fingerprint.value,
      ancestry: ancestry.value,
      text: text.value,
      role: role.value,
      accessibleName: accessibleName.value,
      attributes: attributes.value,
      boundingBox: boundingBox.value,
      viewport: viewport.value,
      computedStyles: computedStyles.value,
    },
  };
}

function parseFrameworkEvidence(value: unknown): ParseStep<ReviewBriefFrameworkEvidence | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  const framework = parseObject(value, 'The framework evidence must be an object or null.');
  if (!framework.ok) {
    return framework;
  }
  if (
    !hasExactKeys(framework.value, [
      'confidence',
      'framework',
      'componentName',
      'componentChain',
    ])
  ) {
    return invalid('The framework evidence has unknown or missing fields.');
  }

  const confidence = parseConfidence(framework.value['confidence']);
  const kind = framework.value['framework'];
  const componentName = readNullableString(
    framework.value['componentName'],
    'evidence.framework.componentName',
  );
  const componentChain = readStringArray(
    framework.value['componentChain'],
    'evidence.framework.componentChain',
  );

  if (!confidence.ok) return confidence;
  if (kind !== 'react' && kind !== 'vue' && kind !== 'unknown') {
    return invalid('The framework evidence kind must be react, vue or unknown.');
  }
  if (!componentName.ok) return componentName;
  if (!componentChain.ok) return componentChain;

  return {
    ok: true,
    value: {
      confidence: confidence.value,
      framework: kind,
      componentName: componentName.value,
      componentChain: componentChain.value,
    },
  };
}

function parseSourceMapEvidence(value: unknown): ParseStep<ReviewBriefSourceMapEvidence | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  const sourceMap = parseObject(value, 'The source-map evidence must be an object or null.');
  if (!sourceMap.ok) {
    return sourceMap;
  }
  if (
    !hasExactKeys(sourceMap.value, ['confidence', 'sourceFile', 'line', 'column', 'reason'])
  ) {
    return invalid('The source-map evidence has unknown or missing fields.');
  }

  const confidence = parseConfidence(sourceMap.value['confidence']);
  const sourceFile = readNullableString(sourceMap.value['sourceFile'], 'evidence.sourceMap.sourceFile');
  const line = readNullableInteger(sourceMap.value['line'], 'evidence.sourceMap.line');
  const column = readNullableInteger(sourceMap.value['column'], 'evidence.sourceMap.column');
  const reason = readNullableString(sourceMap.value['reason'], 'evidence.sourceMap.reason');

  if (!confidence.ok) return confidence;
  if (!sourceFile.ok) return sourceFile;
  if (!line.ok) return line;
  if (!column.ok) return column;
  if (!reason.ok) return reason;

  return {
    ok: true,
    value: {
      confidence: confidence.value,
      sourceFile: sourceFile.value,
      line: line.value,
      column: column.value,
      reason: reason.value,
    },
  };
}

function parseVisualEvidence(value: unknown): ParseStep<ReviewBriefVisualEvidence | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  const visual = parseObject(value, 'The visual evidence must be an object or null.');
  if (!visual.ok) {
    return visual;
  }
  if (!hasExactKeys(visual.value, ['confidence', 'viewport', 'elementCrop', 'reason'])) {
    return invalid('The visual evidence has unknown or missing fields.');
  }

  const confidence = parseConfidence(visual.value['confidence']);
  const viewport = parseCaptureStatus(visual.value['viewport']);
  const elementCrop = parseCaptureStatus(visual.value['elementCrop']);
  const reason = readNullableString(visual.value['reason'], 'evidence.visual.reason');

  if (!confidence.ok) return confidence;
  if (!viewport.ok) return viewport;
  if (!elementCrop.ok) return elementCrop;
  if (!reason.ok) return reason;

  const capturedEverything = viewport.value === 'captured' && elementCrop.value === 'captured';
  if (capturedEverything && reason.value !== null) {
    return invalid('The visual evidence reason must be null when both screenshots were captured.');
  }
  if (!capturedEverything && (reason.value === null || reason.value.trim().length === 0)) {
    return invalid('The visual evidence reason is required when a screenshot failed.');
  }

  return {
    ok: true,
    value: {
      confidence: confidence.value,
      viewport: viewport.value,
      elementCrop: elementCrop.value,
      reason: reason.value,
    },
  };
}

function parseBriefAttachment(value: unknown): ParseStep<ReviewBriefAttachment> {
  const attachment = parseObject(value, 'Each review brief attachment must be an object.');
  if (!attachment.ok) {
    return attachment;
  }
  if (
    !hasExactKeys(attachment.value, [
      'id',
      'kind',
      'mimeType',
      'width',
      'height',
      'byteLength',
      'file',
      'unavailableReason',
    ])
  ) {
    return invalid('A review brief attachment has unknown or missing fields.');
  }

  const id = readString(attachment.value['id'], 'attachment.id');
  const kind = attachment.value['kind'];
  const mimeType = readString(attachment.value['mimeType'], 'attachment.mimeType');
  const width = readPositiveInteger(attachment.value['width'], 'attachment.width');
  const height = readPositiveInteger(attachment.value['height'], 'attachment.height');
  const byteLength = readNonNegativeInteger(attachment.value['byteLength'], 'attachment.byteLength');
  const file = readNullableString(attachment.value['file'], 'attachment.file');
  const unavailableReason = readNullableString(
    attachment.value['unavailableReason'],
    'attachment.unavailableReason',
  );

  if (!id.ok) return id;
  if (kind !== 'viewport-screenshot' && kind !== 'element-crop') {
    return invalid('A review brief attachment has an unknown kind.');
  }
  if (!mimeType.ok) return mimeType;
  if (!width.ok) return width;
  if (!height.ok) return height;
  if (!byteLength.ok) return byteLength;
  if (!file.ok) return file;
  if (!unavailableReason.ok) return unavailableReason;

  if (file.value !== null && !isSafeReviewBriefFileName(file.value)) {
    return invalid('A review brief attachment file name cannot be used in a handoff directory.');
  }
  if (file.value === null && (unavailableReason.value === null || unavailableReason.value.trim().length === 0)) {
    return invalid('A review brief attachment without a file must explain why.');
  }
  if (file.value !== null && unavailableReason.value !== null) {
    return invalid('A review brief attachment with a file must not carry an unavailable reason.');
  }

  return {
    ok: true,
    value: {
      id: id.value,
      kind,
      mimeType: mimeType.value,
      width: width.value,
      height: height.value,
      byteLength: byteLength.value,
      file: file.value,
      unavailableReason: unavailableReason.value,
    },
  };
}

interface ParseFailure {
  readonly ok: false;
  readonly code: 'invalid-brief' | 'unsupported-brief-version';
  readonly message: string;
}

type ParseStep<T> = { readonly ok: true; readonly value: T } | ParseFailure;

function parseObject(value: unknown, message: string): ParseStep<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(message);
  }
  return { ok: true, value: value as Record<string, unknown> };
}

function parseConfidence(value: unknown): ParseStep<Confidence> {
  if (value !== 'confirmed' && value !== 'inferred' && value !== 'unavailable') {
    return invalid('A review brief confidence must be confirmed, inferred or unavailable.');
  }
  return { ok: true, value };
}

function parseCaptureStatus(value: unknown): ParseStep<'captured' | 'failed'> {
  if (value !== 'captured' && value !== 'failed') {
    return invalid('A review brief capture status must be captured or failed.');
  }
  return { ok: true, value };
}

function readString(value: unknown, field: string): ParseStep<string> {
  if (typeof value !== 'string') {
    return invalid(`The review brief ${field} must be a string.`);
  }
  return { ok: true, value };
}

function readNullableString(value: unknown, field: string): ParseStep<string | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  return readString(value, field);
}

function readNullableInteger(value: unknown, field: string): ParseStep<number | null> {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return invalid(`The review brief ${field} must be a non-negative integer or null.`);
  }
  return { ok: true, value };
}

function readPositiveInteger(value: unknown, field: string): ParseStep<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return invalid(`The review brief ${field} must be a positive integer.`);
  }
  return { ok: true, value };
}

function readNonNegativeInteger(value: unknown, field: string): ParseStep<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return invalid(`The review brief ${field} must be a non-negative integer.`);
  }
  return { ok: true, value };
}

function readStringArray(value: unknown, field: string): ParseStep<string[]> {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return invalid(`The review brief ${field} must be an array of strings.`);
  }
  return { ok: true, value: [...(value as string[])] };
}

function readStringRecord(value: unknown, field: string): ParseStep<Record<string, string>> {
  const record = parseObject(value, `The review brief ${field} must be an object.`);
  if (!record.ok) {
    return record;
  }
  const entries = Object.entries(record.value);
  if (entries.some(([, entry]) => typeof entry !== 'string')) {
    return invalid(`The review brief ${field} must map strings to strings.`);
  }
  return { ok: true, value: Object.fromEntries(entries) as Record<string, string> };
}

function parseRect(
  value: unknown,
  field: string,
): ParseStep<{ x: number; y: number; width: number; height: number }> {
  const rect = parseObject(value, `The review brief ${field} must be an object.`);
  if (!rect.ok) {
    return rect;
  }
  if (!hasExactKeys(rect.value, ['x', 'y', 'width', 'height'])) {
    return invalid(`The review brief ${field} has unknown or missing fields.`);
  }
  const x = rect.value['x'];
  const y = rect.value['y'];
  const width = rect.value['width'];
  const height = rect.value['height'];
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width < 0 ||
    height < 0
  ) {
    return invalid(`The review brief ${field} must contain finite numbers.`);
  }
  return { ok: true, value: { x, y, width, height } };
}

function parseViewport(
  value: unknown,
  field: string,
): ParseStep<{ width: number; height: number }> {
  const viewport = parseObject(value, `The review brief ${field} must be an object.`);
  if (!viewport.ok) {
    return viewport;
  }
  if (!hasExactKeys(viewport.value, ['width', 'height'])) {
    return invalid(`The review brief ${field} has unknown or missing fields.`);
  }
  const width = viewport.value['width'];
  const height = viewport.value['height'];
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
    return invalid(`The review brief ${field} must contain finite numbers.`);
  }
  return { ok: true, value: { width, height } };
}

function toBriefComment(
  comment: ReviewComment,
  index: number,
  files: ReviewBriefFile[],
  usedNames: Set<string>,
): ReviewBriefComment {
  return {
    index,
    id: comment.id,
    text: comment.text,
    category: comment.category,
    priority: comment.priority,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    evidence: {
      dom: firstDomEvidence(comment),
      framework: firstFrameworkEvidence(comment),
      sourceMap: firstSourceMapEvidence(comment),
      visual: firstVisualEvidence(comment),
    },
    attachments: comment.attachments.map((attachment) =>
      toBriefAttachment(attachment, index, files, usedNames),
    ),
  };
}

function firstDomEvidence(comment: ReviewComment): ReviewBriefDomEvidence | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type === 'dom') {
      const { type: _type, ...payload } = evidence.payload;
      return { confidence: evidence.confidence, ...payload };
    }
  }
  return null;
}

function firstFrameworkEvidence(comment: ReviewComment): ReviewBriefFrameworkEvidence | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type === 'framework') {
      const { type: _type, ...payload } = evidence.payload;
      return { confidence: evidence.confidence, ...payload };
    }
  }
  return null;
}

function firstSourceMapEvidence(comment: ReviewComment): ReviewBriefSourceMapEvidence | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type === 'source-map') {
      const { type: _type, ...payload } = evidence.payload;
      return { confidence: evidence.confidence, ...payload };
    }
  }
  return null;
}

function firstVisualEvidence(comment: ReviewComment): ReviewBriefVisualEvidence | null {
  for (const evidence of comment.evidence) {
    if (evidence.payload.type === 'visual') {
      const { type: _type, ...payload } = evidence.payload;
      return { confidence: evidence.confidence, ...payload };
    }
  }
  return null;
}

function toBriefAttachment(
  attachment: ReviewComment['attachments'][number],
  index: number,
  files: ReviewBriefFile[],
  usedNames: Set<string>,
): ReviewBriefAttachment {
  const base = {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    byteLength: attachment.byteLength,
  };

  if (attachment.storage.type !== 'inline-data-url') {
    return {
      ...base,
      file: null,
      unavailableReason:
        'The image is stored outside the browser profile and is not part of the exported brief.',
    };
  }

  const decoded = decodeInlineImage(attachment.storage.dataUrl);
  if (!decoded.ok) {
    return { ...base, file: null, unavailableReason: decoded.message };
  }
  if (decoded.mimeType !== attachment.mimeType) {
    return {
      ...base,
      file: null,
      unavailableReason: 'The attachment media type does not match its inline image data.',
    };
  }
  if (files.length >= REVIEW_BRIEF_MAX_FILES) {
    return {
      ...base,
      file: null,
      unavailableReason: `The handoff is limited to ${REVIEW_BRIEF_MAX_FILES} images.`,
    };
  }

  const name = allocateFileName(index, attachment.kind, decoded.mimeType, usedNames);
  files.push({ name, mediaType: decoded.mimeType, content: decoded.bytes });
  return { ...base, file: name, unavailableReason: null };
}

function decodeInlineImage(
  dataUrl: string,
): { ok: true; mimeType: ReviewBriefImageMediaType; bytes: Uint8Array } | ParseFailure {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (match === null) {
    return invalid('The attachment is not a base64 image data URL.');
  }
  const mimeType = match[1];
  const encoded = match[2];
  if (mimeType === undefined || encoded === undefined || !isReviewBriefImageMediaType(mimeType)) {
    return invalid('The attachment image format cannot be exported.');
  }
  const decoded = decodeBase64(encoded);
  if (!decoded.ok) {
    return invalid('The attachment image data is not canonical base64.');
  }
  if (decoded.bytes.byteLength === 0) {
    return invalid('The attachment image is empty.');
  }
  if (decoded.bytes.byteLength > REVIEW_BRIEF_MAX_FILE_BYTES) {
    return invalid('The attachment image is too large to export.');
  }
  return { ok: true, mimeType, bytes: decoded.bytes };
}

function allocateFileName(
  index: number,
  kind: string,
  mediaType: ReviewBriefImageMediaType,
  usedNames: Set<string>,
): string {
  const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length);
  const base = `${String(index).padStart(2, '0')}-${kind}`;
  let candidate = `${base}.${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}-${suffix}.${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Conservative file-name rule for files next to the brief: the bridge's artifact-name slug
 * rules plus a refusal of the reserved `review.md` / `review.json` names.
 */
export function isSafeReviewBriefFileName(value: string): boolean {
  return (
    isSafeArtifactName(value) &&
    value !== REVIEW_BRIEF_MARKDOWN_FILE &&
    value !== REVIEW_BRIEF_JSON_FILE
  );
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isCommentCategory(value: unknown): value is CommentCategory {
  return (
    typeof value === 'string' &&
    ['UI', 'UX', 'Content', 'Accessibility', 'Performance', 'Bug', 'Other'].includes(value)
  );
}

function isCommentPriority(value: unknown): value is CommentPriority {
  return typeof value === 'string' && ['critical', 'important', 'minor'].includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pushComment(
  lines: string[],
  comment: ReviewBriefComment,
  paths: ReviewBriefPaths,
): void {
  const order = String(comment.index).padStart(2, '0');
  lines.push(`### ${order} — ${comment.category} · ${comment.priority}`, `Comment ID: ${comment.id}`);
  lines.push('Text:');
  for (const line of comment.text.split('\n')) {
    lines.push(`  ${line}`);
  }
  lines.push(`Created: ${comment.createdAt}`, `Updated: ${comment.updatedAt}`);

  const { dom, framework, sourceMap, visual } = comment.evidence;
  if (dom !== null) {
    lines.push(`DOM evidence: ${dom.confidence}`);
    lines.push(`Selector: ${dom.fingerprint}`);
    const element = describeElement(dom);
    if (element !== null) {
      lines.push(`Element: ${element}`);
    }
    const renderedText = dom.text.trim().replaceAll(/\s+/g, ' ');
    if (renderedText.length > 0) {
      lines.push(`Rendered text: ${renderedText}`);
    }
    lines.push(
      `Bounding box: ${formatNumber(dom.boundingBox.width)}×${formatNumber(dom.boundingBox.height)}` +
        ` at (${formatNumber(dom.boundingBox.x)}, ${formatNumber(dom.boundingBox.y)})` +
        ` · viewport ${formatNumber(dom.viewport.width)}×${formatNumber(dom.viewport.height)}`,
    );
  }
  if (framework !== null) {
    if (framework.confidence === 'unavailable') {
      lines.push('Framework context: unavailable');
    } else {
      const name = framework.componentName ?? 'unknown component';
      lines.push(`Framework evidence: ${framework.confidence} — ${framework.framework} · ${name}`);
      if (framework.componentChain.length > 0) {
        lines.push(`Component chain: ${framework.componentChain.join(' > ')}`);
      }
    }
  }
  if (sourceMap !== null) {
    const location =
      sourceMap.sourceFile === null
        ? `unavailable (${sourceMap.reason ?? 'no source map'})`
        : `${sourceMap.sourceFile}:${sourceMap.line ?? 0}:${sourceMap.column ?? 0}`;
    lines.push(`Source map: ${sourceMap.confidence} — ${location}`);
  }
  if (visual !== null) {
    const parts = [
      `viewport ${visual.viewport}`,
      `element crop ${visual.elementCrop}`,
    ];
    const reason = visual.reason === null ? '' : ` (${visual.reason})`;
    lines.push(`Visual evidence: ${visual.confidence} — ${parts.join(', ')}${reason}`);
  }

  for (const attachment of comment.attachments) {
    const label = attachment.kind === 'element-crop' ? 'Element crop' : 'Viewport screenshot';
    const alt = attachment.kind === 'element-crop' ? 'Element crop' : 'Viewport screenshot';
    const path = attachment.file === null ? undefined : paths.filePaths[attachment.file];
    if (attachment.file !== null && path !== undefined) {
      lines.push(`${label}: ${path}`);
      lines.push(`![${alt}](<${path}>)`);
    } else {
      lines.push(`${label}: not exported — ${attachment.unavailableReason ?? 'no file'}`);
    }
  }

  lines.push('');
}

function describeElement(dom: ReviewBriefDomEvidence): string | null {
  const name = dom.accessibleName?.trim() ?? '';
  const role = dom.role?.trim() ?? '';
  if (role.length > 0 && name.length > 0) {
    return `${role} "${name}"`;
  }
  if (role.length > 0) {
    return role;
  }
  return null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  const present = Object.keys(value);
  return present.length === allowed.size && present.every((key) => allowed.has(key));
}

function invalid(message: string): ParseFailure {
  return { ok: false, code: 'invalid-brief', message };
}

function unsupportedVersion(message: string): ParseFailure {
  return { ok: false, code: 'unsupported-brief-version', message };
}
