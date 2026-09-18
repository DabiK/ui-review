import { describe, expect, it } from 'vitest';
import type { AppDataPathsPort } from '../../src/bridge/core/ports/app-data-paths';

export interface AppDataPathsContractOptions {
  readonly name: string;
  readonly createPort: (environment: {
    readonly home: string;
    readonly env: Record<string, string | undefined>;
  }) => AppDataPathsPort;
  readonly home: string;
  readonly expectedDefault: string;
  readonly override?: {
    readonly variable: string;
    readonly value: string;
    readonly expected: string;
    readonly relativeValue: string;
  };
}

/** Behaviour every OS `AppDataPathsPort` implementation must provide. */
export function describeAppDataPathsPortContract(options: AppDataPathsContractOptions): void {
  describe(`${options.name} AppDataPathsPort contract`, () => {
    it('returns the platform default under the home directory', () => {
      const port = options.createPort({ home: options.home, env: {} });

      expect(port.appDataDirectory()).toBe(options.expectedDefault);
    });

    it('honours a valid environment override', () => {
      if (options.override === undefined) {
        return;
      }
      const port = options.createPort({
        home: options.home,
        env: { [options.override.variable]: options.override.value },
      });

      expect(port.appDataDirectory()).toBe(options.override.expected);
    });

    it('ignores a relative environment override', () => {
      if (options.override === undefined) {
        return;
      }
      const port = options.createPort({
        home: options.home,
        env: { [options.override.variable]: options.override.relativeValue },
      });

      expect(port.appDataDirectory()).toBe(options.expectedDefault);
    });

    it('refuses a non-absolute or blank home instead of guessing', () => {
      expect(() => options.createPort({ home: 'relative/home', env: {} })).toThrow(/absolute/i);
      expect(() => options.createPort({ home: '   ', env: {} })).toThrow(/absolute/i);
    });
  });
}
