import {
  unavailableFrameworkObservation,
  type ComponentContextPort,
  type ComponentContextRequest,
  type FrameworkObservation,
} from '@core';

export interface FakeComponentContextOptions {
  readonly observation?: FrameworkObservation;
  readonly onDetect?: (request: ComponentContextRequest) => void;
}

/** Default: an explicit failure so an unconfigured fake never pretends to detect a framework. */
export class FakeComponentContextAdapter implements ComponentContextPort {
  /** Every request received, so tests can assert the transport context exactly. */
  readonly requests: ComponentContextRequest[] = [];

  private observation: FrameworkObservation;
  private onDetect: ((request: ComponentContextRequest) => void) | null;

  constructor(options: FakeComponentContextOptions = {}) {
    this.observation = options.observation ?? unavailableFrameworkObservation();
    this.onDetect = options.onDetect ?? null;
  }

  setObservation(observation: FrameworkObservation): void {
    this.observation = observation;
  }

  setOnDetect(onDetect: ((request: ComponentContextRequest) => void) | null): void {
    this.onDetect = onDetect;
  }

  async detect(request: ComponentContextRequest): Promise<FrameworkObservation> {
    this.requests.push(request);
    this.onDetect?.(request);
    return {
      ...this.observation,
      componentChain: [...this.observation.componentChain],
    };
  }
}
