import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { FileSystemArtifactStore } from './adapters/fs/file-system-artifact-store';
import {
  serveNativeMessaging,
  type NativeMessagingServer,
} from './adapters/native-messaging/native-messaging-server';
import { createPlatformAppDataPaths } from './adapters/os/app-data-paths';
import { parseAllowedOrigins } from './core/config';
import { handleBridgeMessage } from './core/handle-request';
import type { AppDataPathsPort } from './core/ports/app-data-paths';
import { BRIDGE_VERSION } from './core/version';

/**
 * Composition root of the native bridge executable. Chrome launches it through a Native
 * Messaging host manifest and speaks length-prefixed JSON on stdin/stdout. It never opens a
 * port; the only durable side effect is writing under the OS application-data directory.
 */

const APP_DIRECTORY_NAME = 'ui-review';
const ALLOWED_ORIGINS_VARIABLE = 'UI_REVIEW_BRIDGE_ALLOWED_ORIGINS';
const DATA_ROOT_VARIABLE = 'UI_REVIEW_BRIDGE_DATA_ROOT';

const allowedOrigins = parseAllowedOrigins(process.env[ALLOWED_ORIGINS_VARIABLE]);
if (allowedOrigins.length === 0) {
  process.stderr.write(
    `[ui-review-bridge] Refusing to start without ${ALLOWED_ORIGINS_VARIABLE}; ` +
      'the host manifest installer sets it to the allowed extension origin.\n',
  );
  process.exit(1);
}

// Chrome passes the caller origin as the first argument. It is authoritative, so a host
// launched by a misconfigured manifest refuses to serve before reading a single frame.
const callerOrigin = process.argv[2];
if (callerOrigin !== undefined && !allowedOrigins.includes(callerOrigin)) {
  process.stderr.write(`[ui-review-bridge] Refusing to serve the origin ${callerOrigin}.\n`);
  process.exit(1);
}

const paths: AppDataPathsPort = createAppDataPathsOrExit(homedir());
const store = new FileSystemArtifactStore({ root: resolveDataRoot(paths) });

const server: NativeMessagingServer = serveNativeMessaging({
  input: process.stdin,
  output: process.stdout,
  handle: (message) =>
    handleBridgeMessage(message, {
      store,
      allowedOrigins,
      bridgeVersion: BRIDGE_VERSION,
      platform: process.platform,
    }),
  onProtocolError: (message) => {
    process.stderr.write(`[ui-review-bridge] ${message}\n`);
  },
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});

// Chrome closes the host's stdin when the extension disconnects; nothing is left to serve.
process.stdin.on('end', () => {
  server.stop();
  process.exit(0);
});

/**
 * Durable root: the OS application-data directory by default, overridable for development
 * and smoke tests through `UI_REVIEW_BRIDGE_DATA_ROOT` (must be absolute).
 */
function resolveDataRoot(paths: AppDataPathsPort): string {
  const override = process.env[DATA_ROOT_VARIABLE];
  if (override !== undefined && isAbsolute(override)) {
    return override;
  }
  return join(paths.appDataDirectory(), APP_DIRECTORY_NAME);
}

function createAppDataPathsOrExit(home: string): AppDataPathsPort {
  try {
    return createPlatformAppDataPaths(process.platform, { home, env: process.env });
  } catch (error) {
    process.stderr.write(
      `[ui-review-bridge] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return process.exit(1);
  }
}
