/**
 * Driven port: the OS application-data directory. Keeping it behind an adapter means the
 * bridge core never learns about `~/Library/Application Support`, `%APPDATA%` or XDG
 * variables, and each platform convention can be tested in isolation.
 */
export interface AppDataPathsPort {
  /** Absolute application-data directory for the current user. */
  appDataDirectory(): string;
}
