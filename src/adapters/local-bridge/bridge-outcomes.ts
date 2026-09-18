import {
  decodeBase64,
  type BridgeError,
  type BridgeOperation,
  type BridgeResponse,
  type BridgeSuccessResponse,
  type LocalBridgeFailure,
  type LocalBridgeHealthResult,
  type LocalBridgeReadResult,
  type LocalBridgeWriteResult,
} from '@core';

/**
 * Shared interpretation of bridge responses. Both `LocalBridgePort` implementations use these
 * helpers, so a bridge refusal is mapped to the same typed failure whether the transport is
 * Chrome Native Messaging or an in-process double.
 */

export type InterpretedResponse =
  | { readonly ok: true; readonly response: BridgeSuccessResponse }
  | { readonly ok: false; readonly failure: LocalBridgeFailure };

export function interpretBridgeResponse(
  response: BridgeResponse,
  operation: BridgeOperation,
): InterpretedResponse {
  if (!response.ok) {
    return { ok: false, failure: failureFromBridgeError(response.error) };
  }

  if (response.result.kind !== operation) {
    return {
      ok: false,
      failure: invalidResponseFailure(
        `The bridge answered a ${response.result.kind} result to a ${operation} request.`,
      ),
    };
  }

  return { ok: true, response };
}

export function healthOutcome(response: BridgeSuccessResponse): LocalBridgeHealthResult {
  if (response.result.kind !== 'bridge.health') {
    return invalidResponseFailure('The bridge health result is missing.');
  }

  return {
    ok: true,
    health: {
      status: 'ok',
      bridgeVersion: response.result.bridgeVersion,
      platform: response.result.platform,
      artifactRoot: response.result.artifactRoot,
    },
  };
}

export function writeOutcome(response: BridgeSuccessResponse): LocalBridgeWriteResult {
  if (response.result.kind !== 'artifact.write') {
    return invalidResponseFailure('The bridge write result is missing.');
  }

  return {
    ok: true,
    artifact: {
      sessionId: response.result.sessionId,
      name: response.result.name,
      path: response.result.path,
      byteLength: response.result.byteLength,
    },
  };
}

export function readOutcome(response: BridgeSuccessResponse): LocalBridgeReadResult {
  if (response.result.kind !== 'artifact.read') {
    return invalidResponseFailure('The bridge read result is missing.');
  }

  const decoded = decodeBase64(response.result.contentBase64);
  if (!decoded.ok || decoded.bytes.byteLength !== response.result.byteLength) {
    return invalidResponseFailure('The bridge returned an unreadable artifact payload.');
  }

  return {
    ok: true,
    artifact: {
      sessionId: response.result.sessionId,
      name: response.result.name,
      path: response.result.path,
      byteLength: response.result.byteLength,
      mediaType: response.result.mediaType,
      content: decoded.bytes,
    },
  };
}

export function failureFromBridgeError(error: BridgeError | undefined): LocalBridgeFailure {
  if (error === undefined) {
    return invalidResponseFailure('The bridge refused the request without an error.');
  }

  return {
    ok: false,
    reason: error.code === 'artifact-not-found' ? 'artifact-not-found' : 'bridge-rejected',
    message: error.message,
    code: error.code,
  };
}

export function invalidResponseFailure(message: string): LocalBridgeFailure {
  return { ok: false, reason: 'invalid-response', message, code: null };
}

export function transportFailure(message: string): LocalBridgeFailure {
  return { ok: false, reason: 'bridge-unavailable', message, code: null };
}
