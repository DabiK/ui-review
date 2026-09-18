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

/** Explicit `scheme:` prefix, used to leave non-http(s) URLs (`mailto:`, `data:`) alone. */
const SCHEME_PREFIX_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

interface Redaction {
  readonly value: string;
  readonly changed: boolean;
}

/** True when an attribute name carries a secret or a raw form value. */
export function isSensitiveAttributeName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name);
}

/**
 * Removes credentials and secret-like parameters from a URL-like attribute value.
 *
 * - absolute http(s) URLs are parsed, so embedded credentials, secret query parameters and
 *   secret fragment parameters (`#access_token=…`, including hash routes such as
 *   `#/route?token=…`) are redacted;
 * - relative references (`/callback?token=…`, `callback?token=…`, `?token=…`,
 *   `#access_token=…`) and protocol-relative references (`//host/callback?token=…`) are
 *   redacted textually — the core has no page base URL, so this fallback is what keeps an
 *   `href`/`src` value from ever leaking a secret;
 * - anything that is not URL-like, and non-http(s) schemes such as `mailto:` or `data:`,
 *   is returned unchanged.
 */
export function redactUrlSecrets(value: string): string {
  const absolute = parseAbsoluteHttpUrl(value);
  if (absolute !== null) {
    return redactAbsoluteUrl(absolute, value);
  }
  if (SCHEME_PREFIX_PATTERN.test(value)) {
    return value;
  }
  return redactRelativeUrl(value);
}

function parseAbsoluteHttpUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return URL_PROTOCOLS.has(parsed.protocol) ? parsed : null;
}

function redactAbsoluteUrl(parsed: URL, original: string): string {
  let changed = false;

  if (parsed.username !== '' || parsed.password !== '') {
    parsed.username = '';
    parsed.password = '';
    changed = true;
  }

  const search = redactSearch(parsed.search);
  if (search.changed) {
    parsed.search = search.value;
    changed = true;
  }

  const fragment = redactFragment(parsed.hash);
  if (fragment.changed) {
    parsed.hash = fragment.value;
    changed = true;
  }

  return changed ? parsed.toString() : original;
}

/** Redacts secret-like keys in a query string, keeping its leading `?` when present. */
function redactSearch(search: string): Redaction {
  if (search === '') {
    return { value: search, changed: false };
  }
  const payload = search.startsWith('?') ? search.slice(1) : search;
  const redacted = redactParameters(payload);
  return redacted.changed
    ? { value: `?${redacted.value}`, changed: true }
    : { value: search, changed: false };
}

/**
 * Redacts secret-like keys inside a fragment, keeping its leading `#`. Fragments that carry
 * a hash-route query (`#/route?access_token=…`) are split so only the query is rewritten.
 */
function redactFragment(hash: string): Redaction {
  if (hash === '') {
    return { value: hash, changed: false };
  }
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIndex = payload.indexOf('?');
  if (queryIndex !== -1) {
    const redacted = redactParameters(payload.slice(queryIndex + 1));
    return redacted.changed
      ? { value: `#${payload.slice(0, queryIndex)}?${redacted.value}`, changed: true }
      : { value: hash, changed: false };
  }
  const redacted = redactParameters(payload);
  return redacted.changed
    ? { value: `#${redacted.value}`, changed: true }
    : { value: hash, changed: false };
}

/**
 * Redacts secrets in a non-absolute URL reference while preserving its original shape:
 * credentials are stripped from protocol-relative references, then query and fragment
 * parameters are rewritten.
 */
function redactRelativeUrl(value: string): string {
  const hashIndex = value.indexOf('#');
  const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? null : value.slice(hashIndex);

  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? null : beforeHash.slice(queryIndex + 1);

  const credentials = stripEmbeddedCredentials(path);
  const redactedQuery = query === null ? null : redactParameters(query);
  const redactedHash = hash === null ? null : redactFragment(hash);

  const changed =
    credentials.changed || redactedQuery?.changed === true || redactedHash?.changed === true;
  if (!changed) {
    return value;
  }

  let redacted = credentials.value;
  if (redactedQuery !== null) {
    redacted += `?${redactedQuery.value}`;
  }
  if (redactedHash !== null) {
    redacted += redactedHash.value;
  }
  return redacted;
}

/** Redacts secret-like parameter keys in a query or fragment payload (no `?`/`#`). */
function redactParameters(payload: string): Redaction {
  if (payload === '') {
    return { value: payload, changed: false };
  }
  const parameters = new URLSearchParams(payload);
  let changed = false;
  for (const key of [...parameters.keys()]) {
    if (SECRET_QUERY_KEYS.test(key)) {
      parameters.set(key, REDACTED_VALUE);
      changed = true;
    }
  }
  return changed
    ? { value: parameters.toString(), changed: true }
    : { value: payload, changed: false };
}

/** Removes `user:password@` credentials from a protocol-relative reference. */
function stripEmbeddedCredentials(path: string): Redaction {
  const match = /^\/\/([^/?#]*@)/.exec(path);
  if (match === null) {
    return { value: path, changed: false };
  }
  return { value: `//${path.slice(match[0].length)}`, changed: true };
}

/**
 * Copies an attribute record, replacing secret-like names and any secret inside URL-like
 * values (`href`, `src`, …) — absolute, relative and protocol-relative alike.
 */
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
