import { decodeBase64 as decodeBridgeBase64 } from './base64';

/**
 * Versioned request/response protocol between the Chrome extension and the local native
 * bridge. This module is pure and shared by both sides: it holds the allowlisted operations,
 * the artifact vocabulary and the strict parsers, so an unknown or malformed message is
 * rejected before any operation runs and before a byte reaches the filesystem.
 *
 * Both sides must never hand-roll these shapes: the extension builds requests from these
 * types, the bridge validates them with these parsers, and the extension validates the
 * response with the same module. A protocol version bump is a deliberate, reviewable change.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** Native messaging host name registered by the bridge installer (see docs/architecture.md). */
export const BRIDGE_HOST_NAME = 'com.dabik.ui_review_bridge';

/** The only operations the bridge ever executes. Everything else is rejected unread. */
export const BRIDGE_OPERATIONS = ['bridge.health', 'artifact.write', 'artifact.read'] as const;
export type BridgeOperation = (typeof BRIDGE_OPERATIONS)[number];

/** Artifact media types the bridge accepts to persist. */
export const BRIDGE_ARTIFACT_MEDIA_TYPES = [
  'application/json',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/markdown',
  'text/plain',
] as const;
export type BridgeArtifactMediaType = (typeof BRIDGE_ARTIFACT_MEDIA_TYPES)[number];

/** Upper bound for one artifact, decoded. A larger payload is refused before any write. */
export const BRIDGE_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

export const BRIDGE_ERROR_CODES = [
  'invalid-request',
  'unsupported-operation',
  'protocol-mismatch',
  'origin-not-allowed',
  'invalid-session-id',
  'invalid-artifact-name',
  'unsupported-media-type',
  'artifact-too-large',
  'invalid-base64',
  'path-not-allowed',
  'artifact-not-found',
  'io-error',
] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export interface BridgeError {
  readonly code: BridgeErrorCode;
  readonly message: string;
}

export interface BridgeEnvelope {
  readonly protocolVersion: number;
  readonly requestId: string;
  readonly operation: BridgeOperation;
  /** Calling context asserted by the extension, e.g. `chrome-extension://<id>/`. */
  readonly origin: string;
}

export type BridgeHealthPayload = Record<string, never>;

export interface BridgeArtifactWritePayload {
  readonly sessionId: string;
  readonly name: string;
  readonly mediaType: BridgeArtifactMediaType;
  readonly contentBase64: string;
}

export interface ValidatedBridgeArtifactWritePayload {
  readonly sessionId: string;
  readonly name: string;
  readonly mediaType: BridgeArtifactMediaType;
  /** Decoded once during validation so no consumer has to decode the payload again. */
  readonly content: Uint8Array;
}

export interface BridgeArtifactReadPayload {
  readonly sessionId: string;
  readonly name: string;
}

export interface BridgeHealthResult {
  readonly kind: 'bridge.health';
  readonly status: 'ok';
  readonly bridgeVersion: string;
  readonly platform: string;
  readonly artifactRoot: string;
}

export interface BridgeArtifactWriteResult {
  readonly kind: 'artifact.write';
  readonly sessionId: string;
  readonly name: string;
  readonly path: string;
  readonly byteLength: number;
}

export interface BridgeArtifactReadResult {
  readonly kind: 'artifact.read';
  readonly sessionId: string;
  readonly name: string;
  readonly path: string;
  readonly byteLength: number;
  readonly mediaType: BridgeArtifactMediaType;
  readonly contentBase64: string;
}

export type BridgeResult =
  | BridgeHealthResult
  | BridgeArtifactWriteResult
  | BridgeArtifactReadResult;

export interface BridgeSuccessResponse {
  readonly protocolVersion: number;
  readonly requestId: string;
  readonly ok: true;
  readonly result: BridgeResult;
}

export interface BridgeErrorResponse {
  readonly protocolVersion: number;
  readonly requestId: string;
  readonly ok: false;
  readonly error: BridgeError;
}

export type BridgeResponse = BridgeSuccessResponse | BridgeErrorResponse;

export type BridgeParse<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BridgeError };

export interface ParsedBridgeEnvelope {
  readonly envelope: BridgeEnvelope;
  readonly payload: unknown;
}

const ENVELOPE_KEYS = ['protocolVersion', 'requestId', 'operation', 'origin', 'payload'] as const;
const WRITE_PAYLOAD_KEYS = ['sessionId', 'name', 'mediaType', 'contentBase64'] as const;
const READ_PAYLOAD_KEYS = ['sessionId', 'name'] as const;
const RESPONSE_KEYS = ['protocolVersion', 'requestId', 'ok', 'result', 'error'] as const;
const ERROR_KEYS = ['code', 'message'] as const;
const HEALTH_RESULT_KEYS = ['kind', 'status', 'bridgeVersion', 'platform', 'artifactRoot'] as const;
const WRITE_RESULT_KEYS = ['kind', 'sessionId', 'name', 'path', 'byteLength'] as const;
const READ_RESULT_KEYS = [
  'kind',
  'sessionId',
  'name',
  'path',
  'byteLength',
  'mediaType',
  'contentBase64',
] as const;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const ORIGIN_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9_-])?$/;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,125}[A-Za-z0-9_-])?$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function isBridgeOperation(value: unknown): value is BridgeOperation {
  return typeof value === 'string' && (BRIDGE_OPERATIONS as readonly string[]).includes(value);
}

export function isBridgeArtifactMediaType(value: unknown): value is BridgeArtifactMediaType {
  return (
    typeof value === 'string' &&
    (BRIDGE_ARTIFACT_MEDIA_TYPES as readonly string[]).includes(value)
  );
}

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === 'string' && (BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Session ids become path segments, so they are restricted to a conservative slug: no
 * separators, no leading dot, no trailing dot and no Windows reserved device name.
 */
export function isSafeArtifactSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value) && !WINDOWS_RESERVED_NAME_PATTERN.test(value);
}

/** Artifact names are file names: same slug rules as session ids, with a longer budget. */
export function isSafeArtifactName(value: string): boolean {
  return ARTIFACT_NAME_PATTERN.test(value) && !WINDOWS_RESERVED_NAME_PATTERN.test(value);
}

/** Best-effort media type for a stored artifact, used when metadata is unavailable. */
export function guessArtifactMediaType(name: string): BridgeArtifactMediaType | null {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'json':
      return 'application/json';
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    default:
      return null;
  }
}

/** Reads the correlation id from a raw message, even when the message is otherwise invalid. */
export function readRequestId(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return '';
  }
  const candidate = (value as Record<string, unknown>)['requestId'];
  return typeof candidate === 'string' ? candidate : '';
}

export function successResponse(requestId: string, result: BridgeResult): BridgeSuccessResponse {
  return { protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId, ok: true, result };
}

export function errorResponse(requestId: string, error: BridgeError): BridgeErrorResponse {
  return { protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId, ok: false, error };
}

/**
 * Validates the request envelope: exact keys, exact protocol version, an allowlisted
 * operation and a syntactically plausible caller origin. The payload is returned untouched
 * and validated separately, operation by operation.
 */
export function parseBridgeEnvelope(value: unknown): BridgeParse<ParsedBridgeEnvelope> {
  if (!isRecord(value)) {
    return fail('A bridge request must be a JSON object.');
  }
  if (!hasExactKeys(value, ENVELOPE_KEYS)) {
    return fail('The bridge request has unknown or missing envelope fields.');
  }

  const protocolVersion = value['protocolVersion'];
  if (typeof protocolVersion !== 'number' || !Number.isInteger(protocolVersion)) {
    return fail('The bridge protocol version must be an integer.', 'protocol-mismatch');
  }
  if (protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    return fail(
      `Unsupported bridge protocol version ${protocolVersion}; expected ${BRIDGE_PROTOCOL_VERSION}.`,
      'protocol-mismatch',
    );
  }

  const requestId = value['requestId'];
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
    return fail('The bridge request id must be a short, non-blank token.');
  }

  const operation = value['operation'];
  if (!isBridgeOperation(operation)) {
    return fail('The bridge operation is not in the allowlist.', 'unsupported-operation');
  }

  const origin = value['origin'];
  if (typeof origin !== 'string' || !ORIGIN_PATTERN.test(origin)) {
    return fail('The bridge request origin is missing or malformed.');
  }

  return ok({
    envelope: { protocolVersion, requestId, operation, origin },
    payload: value['payload'],
  });
}

export interface BridgePayloadLimits {
  /** Overrides {@link BRIDGE_MAX_ARTIFACT_BYTES}; used by tests and future configuration. */
  readonly maxArtifactBytes?: number;
}

/** Validates one operation payload with its exact shape and decoded content. */
export function parseBridgePayload(
  operation: 'bridge.health',
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<BridgeHealthPayload>;
export function parseBridgePayload(
  operation: 'artifact.write',
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<ValidatedBridgeArtifactWritePayload>;
export function parseBridgePayload(
  operation: 'artifact.read',
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<BridgeArtifactReadPayload>;
export function parseBridgePayload(
  operation: BridgeOperation,
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<BridgeHealthPayload | ValidatedBridgeArtifactWritePayload | BridgeArtifactReadPayload>;
export function parseBridgePayload(
  operation: BridgeOperation,
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<BridgeHealthPayload | ValidatedBridgeArtifactWritePayload | BridgeArtifactReadPayload> {
  switch (operation) {
    case 'bridge.health':
      return parseHealthPayload(value);
    case 'artifact.write':
      return parseArtifactWritePayload(value, options);
    case 'artifact.read':
      return parseArtifactReadPayload(value);
  }
}

/** Validates a bridge response before the extension trusts any of its fields. */
export function parseBridgeResponse(value: unknown): BridgeParse<BridgeResponse> {
  if (!isRecord(value)) {
    return fail('A bridge response must be a JSON object.');
  }
  if (!hasOnlyKeys(value, RESPONSE_KEYS)) {
    return fail('The bridge response has unknown or missing fields.');
  }

  const protocolVersion = value['protocolVersion'];
  if (protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    return fail('The bridge response uses an unexpected protocol version.', 'protocol-mismatch');
  }

  const requestId = value['requestId'];
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return fail('The bridge response is missing its request id.');
  }

  const responseOk = value['ok'];
  if (responseOk === true) {
    return parseSuccessResponse(requestId, value);
  }
  if (responseOk === false) {
    return parseErrorResponse(requestId, value);
  }
  return fail('The bridge response is missing its outcome flag.');
}

function parseSuccessResponse(
  requestId: string,
  value: Record<string, unknown>,
): BridgeParse<BridgeSuccessResponse> {
  const result = value['result'];
  if (!isRecord(result)) {
    return fail('The bridge response is missing its result.');
  }
  if ('error' in value) {
    return fail('A successful bridge response must not carry an error.');
  }

  const parsed = parseBridgeResult(result);
  if (!parsed.ok) {
    return parsed;
  }

  return ok({ protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId, ok: true, result: parsed.value });
}

function parseBridgeResult(result: Record<string, unknown>): BridgeParse<BridgeResult> {
  switch (result['kind']) {
    case 'bridge.health':
      return parseHealthResult(result);
    case 'artifact.write':
      return parseArtifactWriteResult(result);
    case 'artifact.read':
      return parseArtifactReadResult(result);
    default:
      return fail('The bridge result kind is not allowlisted.');
  }
}

function parseHealthResult(result: Record<string, unknown>): BridgeParse<BridgeHealthResult> {
  if (!hasExactKeys(result, HEALTH_RESULT_KEYS)) {
    return fail('The bridge health result has unexpected fields.');
  }
  const bridgeVersion = result['bridgeVersion'];
  const platform = result['platform'];
  const artifactRoot = result['artifactRoot'];
  if (result['status'] !== 'ok') {
    return fail('The bridge health result is not ok.');
  }
  if (!isNonBlankString(bridgeVersion) || !isNonBlankString(platform) || !isNonBlankString(artifactRoot)) {
    return fail('The bridge health result is incomplete.');
  }
  return ok({
    kind: 'bridge.health',
    status: 'ok',
    bridgeVersion,
    platform,
    artifactRoot,
  });
}

function parseArtifactWriteResult(
  result: Record<string, unknown>,
): BridgeParse<BridgeArtifactWriteResult> {
  if (!hasExactKeys(result, WRITE_RESULT_KEYS)) {
    return fail('The bridge write result has unexpected fields.');
  }
  const sessionId = result['sessionId'];
  const name = result['name'];
  const path = result['path'];
  const byteLength = result['byteLength'];
  if (
    typeof sessionId !== 'string' ||
    typeof name !== 'string' ||
    !isNonBlankString(path) ||
    typeof byteLength !== 'number' ||
    !Number.isInteger(byteLength) ||
    byteLength < 0
  ) {
    return fail('The bridge write result is incomplete.');
  }
  return ok({ kind: 'artifact.write', sessionId, name, path, byteLength });
}

function parseArtifactReadResult(
  result: Record<string, unknown>,
): BridgeParse<BridgeArtifactReadResult> {
  if (!hasExactKeys(result, READ_RESULT_KEYS)) {
    return fail('The bridge read result has unexpected fields.');
  }
  const sessionId = result['sessionId'];
  const name = result['name'];
  const path = result['path'];
  const byteLength = result['byteLength'];
  const mediaType = result['mediaType'];
  const contentBase64 = result['contentBase64'];
  if (
    typeof sessionId !== 'string' ||
    typeof name !== 'string' ||
    !isNonBlankString(path) ||
    typeof byteLength !== 'number' ||
    !Number.isInteger(byteLength) ||
    byteLength < 0 ||
    !isBridgeArtifactMediaType(mediaType) ||
    typeof contentBase64 !== 'string'
  ) {
    return fail('The bridge read result is incomplete.');
  }
  return ok({
    kind: 'artifact.read',
    sessionId,
    name,
    path,
    byteLength,
    mediaType,
    contentBase64,
  });
}

function parseErrorResponse(
  requestId: string,
  value: Record<string, unknown>,
): BridgeParse<BridgeErrorResponse> {
  if ('result' in value) {
    return fail('A failed bridge response must not carry a result.');
  }
  const error = value['error'];
  if (!isRecord(error) || !hasExactKeys(error, ERROR_KEYS)) {
    return fail('The bridge error is malformed.');
  }
  const code = error['code'];
  const message = error['message'];
  if (!isBridgeErrorCode(code) || !isNonBlankString(message)) {
    return fail('The bridge error is incomplete.');
  }
  return ok({
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId,
    ok: false,
    error: { code, message },
  });
}

function parseHealthPayload(value: unknown): BridgeParse<BridgeHealthPayload> {
  if (!isRecord(value) || Object.keys(value).length > 0) {
    return fail('The health operation does not accept a payload.');
  }
  return ok({});
}

function parseArtifactWritePayload(
  value: unknown,
  options?: BridgePayloadLimits,
): BridgeParse<ValidatedBridgeArtifactWritePayload> {
  if (!isRecord(value)) {
    return fail('The artifact write payload must be an object.');
  }
  if (!hasExactKeys(value, WRITE_PAYLOAD_KEYS)) {
    return fail('The artifact write payload has unknown or missing fields.');
  }

  const sessionId = value['sessionId'];
  if (typeof sessionId !== 'string' || !isSafeArtifactSessionId(sessionId)) {
    return fail('The session id is not a safe artifact path segment.', 'invalid-session-id');
  }

  const name = value['name'];
  if (typeof name !== 'string' || !isSafeArtifactName(name)) {
    return fail('The artifact name is not a safe file name.', 'invalid-artifact-name');
  }

  const mediaType = value['mediaType'];
  if (!isBridgeArtifactMediaType(mediaType)) {
    return fail('The artifact media type is not allowlisted.', 'unsupported-media-type');
  }

  const contentBase64 = value['contentBase64'];
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    return fail('The artifact content is missing.', 'invalid-base64');
  }

  const decoded = decodeContent(contentBase64);
  if (!decoded.ok) {
    return decoded;
  }
  const maxBytes = options?.maxArtifactBytes ?? BRIDGE_MAX_ARTIFACT_BYTES;
  if (decoded.value.byteLength > maxBytes) {
    return fail(`The artifact exceeds the ${maxBytes} byte limit.`, 'artifact-too-large');
  }

  return ok({ sessionId, name, mediaType, content: decoded.value });
}

function parseArtifactReadPayload(value: unknown): BridgeParse<BridgeArtifactReadPayload> {
  if (!isRecord(value)) {
    return fail('The artifact read payload must be an object.');
  }
  if (!hasExactKeys(value, READ_PAYLOAD_KEYS)) {
    return fail('The artifact read payload has unknown or missing fields.');
  }

  const sessionId = value['sessionId'];
  if (typeof sessionId !== 'string' || !isSafeArtifactSessionId(sessionId)) {
    return fail('The session id is not a safe artifact path segment.', 'invalid-session-id');
  }

  const name = value['name'];
  if (typeof name !== 'string' || !isSafeArtifactName(name)) {
    return fail('The artifact name is not a safe file name.', 'invalid-artifact-name');
  }

  return ok({ sessionId, name });
}

function decodeContent(contentBase64: string): BridgeParse<Uint8Array> {
  const decoded = decodeBridgeBase64(contentBase64);
  if (!decoded.ok) {
    return fail(decoded.message, 'invalid-base64');
  }
  return ok(decoded.bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  const present = Object.keys(value);
  if (present.length !== allowed.size) {
    return false;
  }
  return present.every((key) => allowed.has(key));
}

/** Allows a discriminated union where only one branch's fields are present. */
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function ok<T>(value: T): BridgeParse<T> {
  return { ok: true, value };
}

function fail<T>(message: string, code: BridgeErrorCode = 'invalid-request'): BridgeParse<T> {
  return { ok: false, error: { code, message } };
}
