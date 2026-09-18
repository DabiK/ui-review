import { describe, expect, it } from 'vitest';
import {
  LinuxAppDataPaths,
  MacOsAppDataPaths,
  WindowsAppDataPaths,
  createPlatformAppDataPaths,
} from '../../src/bridge/adapters/os/app-data-paths';
import { describeAppDataPathsPortContract } from './app-data-paths.contract';

describeAppDataPathsPortContract({
  name: 'macOS',
  createPort: (environment) => new MacOsAppDataPaths(environment),
  home: '/Users/reviewer',
  expectedDefault: '/Users/reviewer/Library/Application Support',
});

describeAppDataPathsPortContract({
  name: 'Windows',
  createPort: (environment) => new WindowsAppDataPaths(environment),
  home: 'C:\\Users\\reviewer',
  expectedDefault: 'C:\\Users\\reviewer\\AppData\\Roaming',
  override: {
    variable: 'APPDATA',
    value: 'D:\\Profiles\\reviewer\\Roaming',
    expected: 'D:\\Profiles\\reviewer\\Roaming',
    relativeValue: 'Roaming',
  },
});

describeAppDataPathsPortContract({
  name: 'Linux',
  createPort: (environment) => new LinuxAppDataPaths(environment),
  home: '/home/reviewer',
  expectedDefault: '/home/reviewer/.local/share',
  override: {
    variable: 'XDG_DATA_HOME',
    value: '/home/reviewer/.data',
    expected: '/home/reviewer/.data',
    relativeValue: '.data',
  },
});

describe('createPlatformAppDataPaths', () => {
  it('selects the platform adapter', () => {
    const macEnvironment = { home: '/Users/reviewer', env: {} };

    expect(createPlatformAppDataPaths('darwin', macEnvironment).appDataDirectory()).toBe(
      '/Users/reviewer/Library/Application Support',
    );
    expect(
      createPlatformAppDataPaths('win32', {
        home: 'C:\\Users\\reviewer',
        env: {},
      }).appDataDirectory(),
    ).toBe('C:\\Users\\reviewer\\AppData\\Roaming');
    expect(
      createPlatformAppDataPaths('linux', { home: '/home/reviewer', env: {} }).appDataDirectory(),
    ).toBe('/home/reviewer/.local/share');
  });

  it('refuses unsupported platforms loudly', () => {
    expect(() =>
      createPlatformAppDataPaths('freebsd', { home: '/home/reviewer', env: {} }),
    ).toThrow(/Unsupported platform/);
  });
});
