import { posix, win32 } from 'node:path';
import type { AppDataPathsPort } from '../../core/ports/app-data-paths';

export interface OsPathEnvironment {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/**
 * OS application-data adapters. Each adapter is constructed with an explicit environment so
 * macOS, Windows and Linux conventions are unit-testable from any machine, and each uses the
 * matching path implementation (`posix` vs `win32`) instead of the host's separator.
 */

export class MacOsAppDataPaths implements AppDataPathsPort {
  private readonly home: string;

  constructor(environment: OsPathEnvironment) {
    this.home = assertAbsoluteHome(environment.home, posix.isAbsolute, 'macOS');
  }

  appDataDirectory(): string {
    return posix.join(this.home, 'Library', 'Application Support');
  }
}

export class WindowsAppDataPaths implements AppDataPathsPort {
  private readonly home: string;
  private readonly appData: string | null;

  constructor(environment: OsPathEnvironment) {
    this.home = assertAbsoluteHome(environment.home, win32.isAbsolute, 'Windows');
    this.appData = readAbsoluteEnv(environment.env['APPDATA'], win32.isAbsolute);
  }

  appDataDirectory(): string {
    return this.appData ?? win32.join(this.home, 'AppData', 'Roaming');
  }
}

export class LinuxAppDataPaths implements AppDataPathsPort {
  private readonly home: string;
  private readonly xdgDataHome: string | null;

  constructor(environment: OsPathEnvironment) {
    this.home = assertAbsoluteHome(environment.home, posix.isAbsolute, 'Linux');
    this.xdgDataHome = readAbsoluteEnv(environment.env['XDG_DATA_HOME'], posix.isAbsolute);
  }

  appDataDirectory(): string {
    return this.xdgDataHome ?? posix.join(this.home, '.local', 'share');
  }
}

export function createPlatformAppDataPaths(
  platform: NodeJS.Platform,
  environment: OsPathEnvironment,
): AppDataPathsPort {
  switch (platform) {
    case 'darwin':
      return new MacOsAppDataPaths(environment);
    case 'win32':
      return new WindowsAppDataPaths(environment);
    case 'linux':
      return new LinuxAppDataPaths(environment);
    default:
      throw new Error(`Unsupported platform for the UI Review bridge: ${platform}`);
  }
}

function assertAbsoluteHome(home: string, isAbsolute: (value: string) => boolean, name: string): string {
  if (home.trim().length === 0 || !isAbsolute(home)) {
    throw new Error(`The ${name} home directory must be an absolute path.`);
  }
  return home;
}

/** Reads an environment override; relative values are ignored per the XDG/Windows conventions. */
function readAbsoluteEnv(
  value: string | undefined,
  isAbsolute: (value: string) => boolean,
): string | null {
  if (value === undefined || value.trim().length === 0 || !isAbsolute(value)) {
    return null;
  }
  return value;
}
