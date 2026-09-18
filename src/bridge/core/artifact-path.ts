import { isSafeArtifactName, isSafeArtifactSessionId } from '../../core/bridge/protocol';

/**
 * Per-session artifact layout, shared by every store implementation:
 *
 * ```
 * <root>/sessions/<sessionId>/artifacts/<name>
 * <root>/sessions/<sessionId>/metadata/<name>.json
 * ```
 *
 * Path segments are validated here, once, so no store ever concatenates unchecked user
 * input. Path construction is pure: the filesystem adapter still resolves and verifies
 * containment before touching a file.
 */

export interface ArtifactRelativePaths {
  readonly data: string;
  readonly metadata: string;
}

export type ArtifactPathFailureCode = 'invalid-session-id' | 'invalid-artifact-name';

export type ArtifactPathResult =
  | { readonly ok: true; readonly paths: ArtifactRelativePaths }
  | { readonly ok: false; readonly code: ArtifactPathFailureCode; readonly message: string };

export function buildArtifactRelativePaths(input: {
  readonly sessionId: string;
  readonly name: string;
}): ArtifactPathResult {
  if (!isSafeArtifactSessionId(input.sessionId)) {
    return {
      ok: false,
      code: 'invalid-session-id',
      message: 'The session id is not a safe artifact path segment.',
    };
  }
  if (!isSafeArtifactName(input.name)) {
    return {
      ok: false,
      code: 'invalid-artifact-name',
      message: 'The artifact name is not a safe file name.',
    };
  }

  return {
    ok: true,
    paths: {
      data: `sessions/${input.sessionId}/artifacts/${input.name}`,
      metadata: `sessions/${input.sessionId}/metadata/${input.name}.json`,
    },
  };
}
