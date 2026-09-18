/**
 * Time source for use cases. The core never calls `Date.now()` itself: timestamps come
 * from a clock adapter, so tests can freeze time and production stays honest.
 */
export interface ClockPort {
  /** Current instant as an ISO-8601 UTC timestamp. */
  now(): string;
}
