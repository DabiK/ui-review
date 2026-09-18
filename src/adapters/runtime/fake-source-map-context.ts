import type {
  SourceMapContextPort,
  SourceMapContextRequest,
  SourceMapResolution,
} from '@core';

export interface FakeSourceMapContextOptions {
  readonly resolution?: SourceMapResolution;
  readonly onResolve?: (request: SourceMapContextRequest) => void;
}

const DEFAULT_RESOLUTION: SourceMapResolution = {
  kind: 'unavailable',
  reason: 'The fake source-map adapter is not configured.',
};

/** Scriptable double: an unconfigured fake never pretends to resolve a source location. */
export class FakeSourceMapContextAdapter implements SourceMapContextPort {
  /** Every request received, so tests can assert the exact page context and reference. */
  readonly requests: SourceMapContextRequest[] = [];

  private resolution: SourceMapResolution;
  private onResolve: ((request: SourceMapContextRequest) => void) | null;

  constructor(options: FakeSourceMapContextOptions = {}) {
    this.resolution = options.resolution ?? DEFAULT_RESOLUTION;
    this.onResolve = options.onResolve ?? null;
  }

  setResolution(resolution: SourceMapResolution): void {
    this.resolution = resolution;
  }

  setOnResolve(onResolve: ((request: SourceMapContextRequest) => void) | null): void {
    this.onResolve = onResolve;
  }

  async resolve(request: SourceMapContextRequest): Promise<SourceMapResolution> {
    this.requests.push({
      pageUrl: request.pageUrl,
      reference: { ...request.reference },
    });
    this.onResolve?.(request);
    return { ...this.resolution };
  }
}
