#!/usr/bin/env node
/**
 * Packages the UI Review bridge as standalone executables (issue #10).
 *
 * A Node SEA (single executable application) is produced by embedding the CommonJS bridge
 * bundle (`dist/bridge/main.cjs`) into a Node runtime with postject. The resulting binary
 * embeds its own runtime: no Node.js installation is required on the reviewer machine.
 *
 * Targets:
 *   darwin-arm64  built from the local Node runtime (must run on macOS arm64) and ad-hoc signed
 *   win-x64       built from node.exe for the requested version (downloaded from nodejs.org
 *                 unless `--node-binary` points at one)
 *
 * Usage:
 *   node scripts/package-bridge.mjs [--target <darwin-arm64|win-x64|all>] [--out <dir>]
 *                                   [--node-version <vX.Y.Z>] [--node-binary <path>]
 *   node scripts/package-bridge.mjs --plan [--json] [--extension-id <id>]
 *
 * Run `npm run build` first so `dist/bridge/main.cjs` exists.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_TARGETS,
  SEA_BLOB_RESOURCE,
  SEA_FUSE,
  SEA_MACHO_SEGMENT,
  buildReleasePlan,
  findReleaseTarget,
  isValidExtensionId,
} from './lib/bridge-release.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const bridgeBundlePath = resolve(root, 'dist', 'bridge', 'main.cjs');
const packagingDir = resolve(root, 'packaging');
const postjectCliPath = resolve(root, 'node_modules', 'postject', 'dist', 'cli.js');
const protocolSourcePath = resolve(root, 'src', 'core', 'bridge', 'protocol.ts');
const packageJsonPath = resolve(root, 'package.json');

const EXECUTABLE_IDENTIFIER = 'com.dabik.ui_review.bridge';

function fail(message) {
  console.error(`[ui-review] ${message}`);
  process.exit(1);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function readPackageVersion() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

/** The release plan must never drift from the protocol the bridge core actually speaks. */
function readProtocolVersion() {
  const source = readFileSync(protocolSourcePath, 'utf8');
  const match = /BRIDGE_PROTOCOL_VERSION\s*=\s*(\d+)/.exec(source);
  if (match === null || match[1] === undefined) {
    fail(`Could not read BRIDGE_PROTOCOL_VERSION from ${protocolSourcePath}.`);
  }
  return Number(match[1]);
}

function baseNodeVersion(args) {
  return readOption(args, '--node-version') ?? process.version;
}

function planCommand(args) {
  const extensionId = readOption(args, '--extension-id') ?? null;
  if (extensionId !== null && !isValidExtensionId(extensionId)) {
    fail(`"${extensionId}" is not a Chrome extension id (expected 32 letters a-p).`);
  }
  const plan = buildReleasePlan({
    version: readPackageVersion(),
    protocolVersion: readProtocolVersion(),
    nodeVersion: baseNodeVersion(args),
    extensionId,
  });

  if (hasFlag(args, '--json')) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  console.log(`[ui-review] bridge release plan (v${plan.version}, protocol ${plan.protocolVersion})`);
  for (const target of plan.targets) {
    console.log(`  ${target.artifactName}`);
    console.log(`    executable: ${target.executableName}`);
    console.log(`    installs to: ${target.installDirectory}`);
    console.log(`    manifest: ${target.hostManifest.fileName} in ${target.hostManifest.directory}`);
    if (target.registration !== null) {
      console.log(`    registration: ${target.registration.key}`);
    }
    if (target.hostManifest.document !== null) {
      console.log(
        `    allowed origin: ${target.hostManifest.document.allowed_origins.join(', ')}`,
      );
    }
  }
}

function copyInstallerFiles(target, artifactDir) {
  const sourceDir = join(packagingDir, target.id);
  if (!existsSync(sourceDir)) {
    fail(`Missing installer files for ${target.id} in ${sourceDir}.`);
  }
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      fail(`Only files are supported in ${sourceDir} (found ${entry.name}).`);
    }
    copyFileSync(join(sourceDir, entry.name), join(artifactDir, entry.name));
  }
  const required = [target.installerName, target.uninstallerName, 'README.md'];
  for (const name of required) {
    if (!existsSync(join(artifactDir, name))) {
      fail(`Missing ${name} for target ${target.id}.`);
    }
  }
}

function writeSeaConfig(target, cacheDir, blobPath) {
  const configPath = join(cacheDir, `${target.id}.sea-config.json`);
  const config = {
    main: bridgeBundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = spawnSync(process.execPath, ['--experimental-sea-config', configPath], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(`Generating the SEA blob for ${target.id} failed.`);
  }
}

function injectBlob(target, executablePath, blobPath) {
  if (!existsSync(postjectCliPath)) {
    fail('postject is missing. Run `npm install` first.');
  }
  const args = [
    postjectCliPath,
    executablePath,
    SEA_BLOB_RESOURCE,
    blobPath,
    '--sentinel-fuse',
    SEA_FUSE,
  ];
  if (target.platform === 'darwin') {
    args.push('--macho-segment-name', SEA_MACHO_SEGMENT);
  }
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`Injecting the SEA blob into ${executablePath} failed.`);
  }
}

/**
 * macOS refuses to execute injected arm64 binaries until they are re-signed. Ad-hoc signing
 * is enough for a locally installed helper; the Code Signing subsystem occasionally reports a
 * transient internal error, so retry a couple of times before failing.
 */
function signMacOsBinary(executablePath) {
  spawnSync('codesign', ['--remove-signature', executablePath], { stdio: 'ignore' });
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(
      'codesign',
      ['--force', '--sign', '-', '--identifier', EXECUTABLE_IDENTIFIER, executablePath],
      { encoding: 'utf8' },
    );
    if (result.status === 0) {
      return;
    }
    lastError = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
  }
  fail(`codesign failed for ${executablePath}: ${lastError}`);
}

function downloadFile(url, destination) {
  console.log(`[ui-review] downloading ${url}`);
  return fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`${url} responded with HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < 20 * 1024 * 1024) {
        throw new Error(`${url} returned only ${bytes.byteLength} bytes; expected a Node runtime.`);
      }
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
      return destination;
    })
    .catch((error) => {
      fail(`Could not obtain the ${url} runtime: ${error.message}`);
    });
}

/**
 * The Node runtime injected into the artifact. On macOS Apple Silicon the running Node is the
 * natural base; Windows x64 needs a node.exe for the requested version (cached under the
 * output directory).
 */
async function baseNodeBinary(target, args, cacheDir) {
  const explicit = readOption(args, '--node-binary');
  if (explicit !== undefined) {
    if (!existsSync(explicit)) {
      fail(`--node-binary ${explicit} does not exist.`);
    }
    return explicit;
  }
  if (target.platform === 'darwin') {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') {
      fail(
        `Packaging ${target.id} needs a macOS arm64 host (or --node-binary). ` +
          'Run this on Apple Silicon.',
      );
    }
    return process.execPath;
  }

  const version = baseNodeVersion(args);
  const cached = join(cacheDir, `node-${version}-win-x64.exe`);
  if (existsSync(cached)) {
    return cached;
  }
  return downloadFile(`https://nodejs.org/dist/${version}/win-x64/node.exe`, cached);
}

async function packageTarget(target, args, outDir) {
  if (!existsSync(bridgeBundlePath)) {
    fail('dist/bridge/main.cjs is missing. Run `npm run build` first.');
  }

  const artifactDir = join(outDir, target.artifactName);
  const cacheDir = join(outDir, '.cache');
  rmSync(artifactDir, { recursive: true, force: true });
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  console.log(`[ui-review] packaging ${target.artifactName}`);
  copyInstallerFiles(target, artifactDir);

  const base = await baseNodeBinary(target, args, cacheDir);
  const executablePath = join(artifactDir, target.executableName);
  copyFileSync(base, executablePath);
  chmodSync(executablePath, 0o755);

  const blobPath = join(cacheDir, `${target.id}.blob`);
  writeSeaConfig(target, cacheDir, blobPath);
  injectBlob(target, executablePath, blobPath);

  if (target.platform === 'darwin') {
    signMacOsBinary(executablePath);
  }

  const size = statSync(executablePath).size;
  console.log(
    `[ui-review] ${target.artifactName} ready: ${executablePath} (${(size / 1024 / 1024).toFixed(1)} MiB)`,
  );
  return artifactDir;
}

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, '--plan')) {
    planCommand(args);
    return;
  }

  const requested = readOption(args, '--target') ?? 'all';
  const outDir = resolve(process.cwd(), readOption(args, '--out') ?? 'release');
  const targets =
    requested === 'all' ? RELEASE_TARGETS : [findReleaseTarget(requested)].filter(Boolean);

  if (targets.length === 0) {
    fail(`Unknown --target ${requested}. Use darwin-arm64, win-x64 or all.`);
  }

  for (const target of targets) {
    await packageTarget(target, args, outDir);
  }
  console.log(`[ui-review] artifacts written to ${outDir}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
