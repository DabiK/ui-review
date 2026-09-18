import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRIDGE_HOST_NAME, BRIDGE_PROTOCOL_VERSION } from '@core';
import {
  RELEASE_TARGETS,
  buildHostManifest,
  buildLauncher,
  buildReleasePlan,
  executablePathFor,
  findReleaseTarget,
  isValidExtensionId,
} from '../../scripts/lib/bridge-release.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const packageScript = resolve(root, 'scripts', 'package-bridge.mjs');
const TEST_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const TEST_ORIGIN = `chrome-extension://${TEST_EXTENSION_ID}/`;

interface CliManifestDocument {
  readonly name: string;
  readonly type: string;
  readonly path: string;
  readonly allowed_origins: readonly string[];
}

interface CliPlanTarget {
  readonly id: string;
  readonly artifactName: string;
  readonly installerName: string;
  readonly uninstallerName: string;
  readonly installDirectory: string;
  readonly hostManifest: {
    readonly directory: string;
    readonly fileName: string;
    readonly document: CliManifestDocument | null;
  };
  readonly registration: { readonly key: string } | null;
}

interface CliPlan {
  readonly protocolVersion: number;
  readonly hostName: string;
  readonly targets: readonly CliPlanTarget[];
}

function planFromCli(...args: readonly string[]): CliPlan {
  const result = spawnSync(process.execPath, [packageScript, '--plan', '--json', ...args], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as CliPlan;
}

describe('bridge release plan', () => {
  it('lists both supported targets with stable artifact names', () => {
    const plan = planFromCli('--extension-id', TEST_EXTENSION_ID);

    expect(plan.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(plan.hostName).toBe(BRIDGE_HOST_NAME);
    expect(plan.targets.map((target) => target.id)).toEqual(['darwin-arm64', 'win-x64']);
    expect(plan.targets.map((target) => target.artifactName)).toEqual([
      'ui-review-bridge-darwin-arm64',
      'ui-review-bridge-win-x64',
    ]);
    for (const target of plan.targets) {
      expect(target.artifactName).toMatch(/^ui-review-bridge-(darwin-arm64|win-x64)$/);
      expect(existsSync(resolve(root, 'packaging', target.id, target.installerName))).toBe(true);
      expect(existsSync(resolve(root, 'packaging', target.id, target.uninstallerName))).toBe(true);
    }
  });

  it('generates a valid macOS host manifest that points at the installed launcher', () => {
    const plan = planFromCli('--extension-id', TEST_EXTENSION_ID);
    const target = plan.targets.find((candidate) => candidate.id === 'darwin-arm64');
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }

    expect(target.hostManifest.fileName).toBe(`${BRIDGE_HOST_NAME}.json`);
    expect(target.hostManifest.directory).toContain(
      'Library/Application Support/Google/Chrome/NativeMessagingHosts',
    );
    expect(target.installDirectory).toContain('Library/Application Support/ui-review/bridge');
    expect(target.hostManifest.document).toMatchObject({
      name: BRIDGE_HOST_NAME,
      type: 'stdio',
      allowed_origins: [TEST_ORIGIN],
    });
    expect(target.hostManifest.document?.path).toBe(
      '~/Library/Application Support/ui-review/bridge/run-bridge.sh',
    );
    expect(target.registration).toBeNull();
  });

  it('generates a valid Windows host manifest and registry registration', () => {
    const plan = planFromCli('--extension-id', TEST_EXTENSION_ID);
    const target = plan.targets.find((candidate) => candidate.id === 'win-x64');
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }

    expect(target.hostManifest.fileName).toBe(`${BRIDGE_HOST_NAME}.json`);
    expect(target.hostManifest.directory).toBe('%APPDATA%\\ui-review\\bridge');
    expect(target.hostManifest.document).toMatchObject({
      name: BRIDGE_HOST_NAME,
      type: 'stdio',
      allowed_origins: [TEST_ORIGIN],
    });
    expect(target.hostManifest.document?.path).toBe(
      '%APPDATA%\\ui-review\\bridge\\run-bridge.cmd',
    );
    expect(target.registration?.key).toBe(
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${BRIDGE_HOST_NAME}`,
    );
  });

  it('refuses an id that Chrome would never issue', () => {
    const result = spawnSync(
      process.execPath,
      [packageScript, '--plan', '--json', '--extension-id', 'not-an-extension-id'],
      { encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a Chrome extension id');
  });

  it('never drifts from the manifest template and the protocol constant', () => {
    const template = JSON.parse(
      readFileSync(resolve(root, 'src/bridge/native-messaging-host/manifest.example.json'), 'utf8'),
    ) as { readonly name: string; readonly type: string; readonly description: string };

    expect(template.name).toBe(BRIDGE_HOST_NAME);
    expect(template.type).toBe('stdio');
    expect(buildReleasePlan({
      version: '0.0.0',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      nodeVersion: 'v0.0.0',
    }).protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
  });
});

describe('bridge installers', () => {
  it('validates extension ids before building a manifest', () => {
    const target = findReleaseTarget('darwin-arm64');
    expect(target).not.toBeNull();
    if (target === null) {
      return;
    }

    expect(isValidExtensionId(TEST_EXTENSION_ID)).toBe(true);
    expect(isValidExtensionId('z'.repeat(32))).toBe(false);
    expect(isValidExtensionId('a'.repeat(31))).toBe(false);
    expect(() =>
      buildHostManifest(target, { extensionId: 'nope', launcherPath: '/tmp/run-bridge.sh' }),
    ).toThrow(/not a Chrome extension id/);
  });

  it('launchers pin the allowed origin and never call a Node runtime', () => {
    for (const target of RELEASE_TARGETS) {
      const launcher = buildLauncher(target, {
        origin: TEST_ORIGIN,
        executablePath: executablePathFor(target),
      });

      expect(launcher).toContain(TEST_ORIGIN);
      expect(launcher).toContain(target.executableName);
      expect(launcher).not.toMatch(/\bnode(\.exe)?\b/i);
    }
  });

  it('installers create the registration and remove it without touching sessions', () => {
    for (const target of RELEASE_TARGETS) {
      const install = readFileSync(
        resolve(root, 'packaging', target.id, target.installerName),
        'utf8',
      );
      const uninstall = readFileSync(
        resolve(root, 'packaging', target.id, target.uninstallerName),
        'utf8',
      );

      expect(install).toContain(BRIDGE_HOST_NAME);
      expect(install).toContain(target.executableName);
      expect(install).toContain('--health');
      expect(uninstall).toContain(BRIDGE_HOST_NAME);
      // The uninstallers only remove the bridge; persisted sessions stay on disk.
      expect(uninstall).not.toMatch(/(rm -rf|Remove-Item)[^\n]*sessions/);
      // Installers must not require a Node runtime on the target machine.
      expect(install).not.toMatch(/\bnode(\.exe)?\b/i);
      expect(uninstall).not.toMatch(/\bnode(\.exe)?\b/i);
    }
  });

  it('packages a CommonJS bundle with postject and the SEA fuse', () => {
    const source = readFileSync(packageScript, 'utf8');
    const releaseSource = readFileSync(
      resolve(root, 'scripts', 'lib', 'bridge-release.mjs'),
      'utf8',
    );

    expect(source).toContain('main.cjs');
    expect(source).toContain('postject');
    expect(source).toContain('SEA_BLOB_RESOURCE');
    expect(source).toContain('SEA_MACHO_SEGMENT');
    expect(source).toContain('codesign');
    expect(releaseSource).toContain('NODE_SEA_BLOB');
    expect(releaseSource).toContain('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2');
  });
});
