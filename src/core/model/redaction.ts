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

/**
 * Explicit `scheme:` prefix, used to redact the part after the scheme when the platform URL
 * parser rejects an otherwise URL-like value (for example a malformed authority).
 */
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
 * - every value the platform URL parser accepts is redacted, whatever its scheme: embedded
 *   credentials, secret query keys and secret fragment keys (`#access_token=…`, including
 *   hash routes such as `#/route?token=…`) are masked for `http(s)`, `ftp`, `ws(s)` and
 *   custom deep links (`myapp:`, `slack:`, `vscode:`, …) alike. `mailto:`, `data:` and
 *   `javascript:` values are parsed too: a secret-bearing parameter is redacted while
 *   secret-free values stay byte-identical, and such values are never executed, so the
 *   lossy rewrite of a secret-bearing one is an accepted privacy trade-off;
 * - values the parser rejects are redacted textually, from the part after their scheme if
 *   they have one: relative references (`/callback?token=…`, `?token=…`, `#access_token=…`)
 *   and protocol-relative references (`//host/callback?token=…`) lose credentials and
 *   secret-like parameters. The core has no page base URL, so this fallback keeps an
 *   `href`/`src` value from leaking a secret just because it is not an absolute URL;
 * - non-URL values (`Save`) are returned unchanged.
 *
 * Known limitation: Android `intent://…#Intent;…;S.token=…;end` references separate their
 * parameters with `;`, which `URLSearchParams` does not split on, so a secret nested in an
 * intent payload is not masked.
 */
export function redactUrlSecrets(value: string): string {
  const parsed = parseUrl(value);
  if (parsed !== null) {
    return redactParsedUrl(parsed, value);
  }
  const scheme = splitSchemePrefix(value);
  if (scheme === null) {
    return redactRelativeUrl(value);
  }
  const redacted = redactRelativeUrl(scheme.rest);
  return redacted === scheme.rest ? value : `${scheme.prefix}${redacted}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

interface SchemeParts {
  readonly prefix: string;
  readonly rest: string;
}

function splitSchemePrefix(value: string): SchemeParts | null {
  const match = SCHEME_PREFIX_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  return { prefix: match[0], rest: value.slice(match[0].length) };
}

function redactParsedUrl(parsed: URL, original: string): string {
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
 * values (`href`, `src`, …) — whatever the scheme, absolute, relative or protocol-relative.
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
