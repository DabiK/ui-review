/**
 * Facts about the host the UI is running in. The core only sees this port; Chrome and test
 * doubles live in adapters.
 */
export interface RuntimeInfo {
  readonly extensionName: string;
  readonly extensionVersion: string;
  readonly runtimeLabel: string;
}

export interface RuntimeInfoPort {
  read(): Promise<RuntimeInfo>;
}
