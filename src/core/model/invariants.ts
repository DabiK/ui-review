import { DomainValidationError } from './errors';

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function assertNonBlank(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new DomainValidationError(field, `${field} must not be blank`);
  }
  return value;
}

export function assertIsoTimestamp(value: string, field: string): string {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainValidationError(field, `${field} must be an ISO-8601 UTC timestamp`);
  }
  return value;
}

export function assertPositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainValidationError(field, `${field} must be a positive integer`);
  }
  return value;
}

export function assertHttpUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DomainValidationError(field, `${field} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DomainValidationError(field, `${field} must be an http(s) URL`);
  }
  return value;
}
