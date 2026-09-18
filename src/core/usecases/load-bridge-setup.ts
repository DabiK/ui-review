import type { LocalBridgeFailure, LocalBridgePort } from '../ports/local-bridge';
import { checkLocalBridge } from './local-bridge';

/**
 * Read model of the local bridge setup, as the side panel needs to present it: a ready bridge,
 * a bridge that is not installed, or a bridge that exists but is not the build this extension
 * ships with. The bridge and the extension are released together, so the bridge version is
 * expected to match the extension version exactly; the wire-level protocol version is checked
 * separately by every response parse.
 */

export interface LoadBridgeSetupDeps {
  readonly bridge: LocalBridgePort;
  /** Version this extension ships with; supplied by the composition root. */
  readonly expectedVersion: string;
}

export type BridgeSetup =
  | {
      readonly kind: 'ready';
      readonly bridgeVersion: string;
      readonly platform: string;
      readonly artifactRoot: string;
    }
  | {
      readonly kind: 'missing';
      readonly message: string;
    }
  | {
      readonly kind: 'incompatible';
      readonly message: string;
      /** Version reported by the bridge, or `null` when it could not be read. */
      readonly bridgeVersion: string | null;
      readonly expectedVersion: string;
    };

export const BRIDGE_MISSING_MESSAGE =
  'The local bridge is not installed for this browser profile.';
export const BRIDGE_INCOMPATIBLE_MESSAGE =
  'The local bridge did not accept this extension. It is probably an older or different build.';

export async function loadBridgeSetup(deps: LoadBridgeSetupDeps): Promise<BridgeSetup> {
  const result = await checkLocalBridge({ bridge: deps.bridge });
  if (!result.ok) {
    return fromFailure(result, deps.expectedVersion);
  }

  const { health } = result;
  if (health.bridgeVersion === deps.expectedVersion) {
    return {
      kind: 'ready',
      bridgeVersion: health.bridgeVersion,
      platform: health.platform,
      artifactRoot: health.artifactRoot,
    };
  }

  return {
    kind: 'incompatible',
    message: `The local bridge reports v${health.bridgeVersion} but this extension expects v${deps.expectedVersion}.`,
    bridgeVersion: health.bridgeVersion,
    expectedVersion: deps.expectedVersion,
  };
}

/**
 * A bridge that cannot be reached at all is simply not installed; anything it did answer with
 * that does not identify this extension is an incompatible build, which needs a reinstall
 * rather than a first install.
 */
function fromFailure(failure: LocalBridgeFailure, expectedVersion: string): BridgeSetup {
  if (failure.reason === 'bridge-unavailable') {
    return { kind: 'missing', message: BRIDGE_MISSING_MESSAGE };
  }
  return {
    kind: 'incompatible',
    message: BRIDGE_INCOMPATIBLE_MESSAGE,
    bridgeVersion: null,
    expectedVersion,
  };
}
