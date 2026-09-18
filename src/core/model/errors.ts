/**
 * Raised when a caller tries to assemble domain state that violates a core invariant.
 * The message is meant to be actionable for developers, never shown to end users as-is.
 */
export class DomainValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'DomainValidationError';
    this.field = field;
  }
}
