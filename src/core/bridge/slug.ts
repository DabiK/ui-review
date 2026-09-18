/**
 * Slug rules for values that become path segments in the bridge's storage and handoff
 * directories. Shared by the wire protocol and the handoff brief schema so both sides refuse
 * exactly the same names: no separators, no leading dot, no trailing dot, no Windows reserved
 * device name.
 *
 * The module is intentionally dependency-free: `src/core/bridge/protocol.ts` re-exports these
 * helpers for compatibility, and the handoff schema imports them without creating a cycle.
 */

const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9_-])?$/;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,125}[A-Za-z0-9_-])?$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function isSafeArtifactSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value) && !WINDOWS_RESERVED_NAME_PATTERN.test(value);
}

export function isSafeArtifactName(value: string): boolean {
  return ARTIFACT_NAME_PATTERN.test(value) && !WINDOWS_RESERVED_NAME_PATTERN.test(value);
}
