import type { DomAnchor } from './evidence';

/**
 * Privacy rules applied to every piece of DOM evidence before it is persisted. The core
 * owns them so no adapter can bypass redaction, and so they are testable without a browser.
 */

/** Marker left in place of a secret value, so reviewers can see redaction happened. */
export const REDACTED_VALUE = '[redacted]';

/**
 * Attribute names whose value must never be stored: form values and secret-like keys
 * (`password`, `token`, `secret`, authorization headers, session identifiers, …).
 * The pattern matches whole alphanumeric tokens, so `author` or `spinner` stay untouched.
 */
const SENSITIVE_NAME_PATTERN =
  /(?:^|[^a-z0-9])(password|passwd|pwd|pass|secret|token|bearer|authorization|auth|credential|credentials|cookie|csrf|xsrf|otp|pin|value|api[-_]key|access[-_]key|private[-_]key|client[-_]secret|session[-_]id|account[-_]id)(?:[^a-z0-9]|$)/i;

const SECRET_QUERY_KEYS = SENSITIVE_NAME_PATTERN;

const URL_PROTOCOLS = new Set(['http:', 'https:']);

/** True when an attribute name carries a secret or a raw form value. */
export function isSensitiveAttributeName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name);
}

/**
 * Removes credentials and secret-like query parameters from an absolute http(s) URL.
 * Anything that is not such a URL is returned unchanged.
 */
export function redactUrlSecrets(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }
  if (!URL_PROTOCOLS.has(parsed.protocol)) {
    return value;
  }

  let changed = false;
  if (parsed.username !== '' || parsed.password !== '') {
    parsed.username = '';
    parsed.password = '';
    changed = true;
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (SECRET_QUERY_KEYS.test(key)) {
      parsed.searchParams.set(key, REDACTED_VALUE);
      changed = true;
    }
  }

  return changed ? parsed.toString() : value;
}

/** Copies an attribute record, replacing secret-like names and URL secrets. */
export function redactAttributes(
  attributes: Readonly<Record<string, string>>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes)) {
    sanitized[name] = isSensitiveAttributeName(name)
      ? REDACTED_VALUE
      : redactUrlSecrets(value);
  }
  return sanitized;
}

/**
 * Final privacy gate for a DOM anchor: even an adapter that captured too much cannot
 * persist a raw form value or a secret-like attribute.
 */
export function sanitizeDomAnchor(anchor: DomAnchor): DomAnchor {
  return {
    ...anchor,
    attributes: redactAttributes(anchor.attributes),
    computedStyles: { ...anchor.computedStyles },
  };
}
