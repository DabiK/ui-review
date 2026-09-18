/**
 * Bridge configuration helpers. The allowlist is deliberately fail-closed: a bridge started
 * without configured origins rejects every request, including health checks.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return [...new Set(origins)];
}
