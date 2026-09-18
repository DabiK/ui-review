import type { RuntimeInfo, RuntimeInfoPort } from '@core';

/** Test double: returns a fixed runtime description, no browser required. */
export class StaticRuntimeInfoAdapter implements RuntimeInfoPort {
  constructor(private readonly info: RuntimeInfo) {}

  async read(): Promise<RuntimeInfo> {
    return this.info;
  }
}
