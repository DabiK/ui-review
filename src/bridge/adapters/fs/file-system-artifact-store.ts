import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  guessArtifactMediaType,
  isBridgeArtifactMediaType,
  type BridgeArtifactMediaType,
} from '../../../core/bridge/protocol';
import { buildArtifactRelativePaths } from '../../core/artifact-path';
import type {
  ArtifactStoreFailure,
  ArtifactStorePort,
  ArtifactWriteInput,
  StoredArtifactContent,
  StoredArtifactRecord,
} from '../../core/ports/artifact-store';

export interface FileSystemArtifactStoreOptions {
  /** Absolute durable root; usually `<OS app data>/ui-review`. */
  readonly root: string;
}

interface ArtifactMetadata {
  readonly mediaType: BridgeArtifactMediaType;
  readonly byteLength: number;
}

/**
 * Production artifact store. Every path is built by the pure path builder, then joined to the
 * root and verified again after symlink resolution: a session folder that points elsewhere
 * (planted symlink, junction) can never be written to or read from. Writes are plain files
 * plus a metadata sidecar holding the media type, so reads never have to guess.
 */
export class FileSystemArtifactStore implements ArtifactStorePort {
  readonly root: string;

  constructor(options: FileSystemArtifactStoreOptions) {
    if (!isAbsolute(options.root)) {
      throw new Error('The artifact root must be an absolute path.');
    }
    this.root = resolve(options.root);
  }

  async write(
    input: ArtifactWriteInput,
  ): Promise<{ readonly ok: true; readonly artifact: StoredArtifactRecord } | ArtifactStoreFailure> {
    const built = buildArtifactRelativePaths(input);
    if (!built.ok) {
      return { ok: false, code: built.code, message: built.message };
    }

    const dataPath = join(this.root, built.paths.data);
    const metadataPath = join(this.root, built.paths.metadata);

    try {
      const rootReal = await realpath(this.root).catch(async () => {
        await mkdir(this.root, { recursive: true });
        return realpath(this.root);
      });

      await mkdir(dirname(dataPath), { recursive: true });
      await mkdir(dirname(metadataPath), { recursive: true });

      const dataDirectory = await resolveWritableDirectory(rootReal, dataPath);
      const metadataDirectory = await resolveWritableDirectory(rootReal, metadataPath);
      if (dataDirectory === null || metadataDirectory === null) {
        return pathFailure();
      }

      await writeFile(dataPath, input.content);
      const metadata: ArtifactMetadata = {
        mediaType: input.mediaType,
        byteLength: input.content.byteLength,
      };
      await writeFile(metadataPath, JSON.stringify(metadata));

      return {
        ok: true,
        artifact: {
          sessionId: input.sessionId,
          name: input.name,
          path: dataPath,
          byteLength: input.content.byteLength,
        },
      };
    } catch (error) {
      return ioFailure(error);
    }
  }

  async read(input: {
    readonly sessionId: string;
    readonly name: string;
  }): Promise<{ readonly ok: true; readonly artifact: StoredArtifactContent } | ArtifactStoreFailure> {
    const built = buildArtifactRelativePaths(input);
    if (!built.ok) {
      return { ok: false, code: built.code, message: built.message };
    }

    const dataPath = join(this.root, built.paths.data);
    const metadataPath = join(this.root, built.paths.metadata);

    try {
      const rootReal = await realpath(this.root).catch(() => null);
      if (rootReal === null) {
        return notFound(input.name);
      }

      const resolvedData = await realpath(dataPath).catch(() => null);
      if (resolvedData === null) {
        return notFound(input.name);
      }
      if (!isWithin(rootReal, resolvedData)) {
        return pathFailure();
      }

      const stats = await stat(resolvedData);
      if (!stats.isFile()) {
        return notFound(input.name);
      }

      const content = new Uint8Array(await readFile(resolvedData));
      const metadata = await readMetadata(metadataPath, rootReal);
      if (!metadata.ok) {
        return metadata;
      }
      if (metadata.value !== null && metadata.value.byteLength !== content.byteLength) {
        return {
          ok: false,
          code: 'io-error',
          message: 'The stored artifact does not match its metadata; refusing to serve it.',
        };
      }

      const mediaType = metadata.value?.mediaType ?? guessArtifactMediaType(input.name);
      if (mediaType === null) {
        return {
          ok: false,
          code: 'io-error',
          message: 'The stored artifact has no readable media type metadata.',
        };
      }

      return {
        ok: true,
        artifact: {
          sessionId: input.sessionId,
          name: input.name,
          path: dataPath,
          byteLength: content.byteLength,
          mediaType,
          content,
        },
      };
    } catch (error) {
      return ioFailure(error);
    }
  }
}

async function readMetadata(
  metadataPath: string,
  rootReal: string,
): Promise<
  | { readonly ok: true; readonly value: ArtifactMetadata | null }
  | ArtifactStoreFailure
> {
  const resolved = await realpath(metadataPath).catch(() => null);
  if (resolved === null) {
    return { ok: true, value: null };
  }
  if (!isWithin(rootReal, resolved)) {
    return pathFailure();
  }

  try {
    const parsed = JSON.parse(await readFile(resolved, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('metadata is not an object');
    }
    const mediaType = parsed['mediaType'];
    const byteLength = parsed['byteLength'];
    if (
      !isBridgeArtifactMediaType(mediaType) ||
      typeof byteLength !== 'number' ||
      !Number.isInteger(byteLength) ||
      byteLength < 0
    ) {
      throw new Error('metadata fields are invalid');
    }
    return { ok: true, value: { mediaType, byteLength } };
  } catch (error) {
    return ioFailure(error);
  }
}

async function resolveWritableDirectory(
  rootReal: string,
  filePath: string,
): Promise<string | null> {
  const directory = await realpath(dirname(filePath)).catch(() => null);
  if (directory === null || !isWithin(rootReal, directory)) {
    return null;
  }
  const existing = await lstatOrNull(filePath);
  return existing?.isSymbolicLink() === true ? null : directory;
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function lstatOrNull(path: string) {
  return lstat(path).catch(() => null);
}

function pathFailure(): ArtifactStoreFailure {
  return {
    ok: false,
    code: 'path-not-allowed',
    message: 'The artifact path escapes the per-session storage root.',
  };
}

function notFound(name: string): ArtifactStoreFailure {
  return {
    ok: false,
    code: 'artifact-not-found',
    message: `No artifact named ${name} is stored for this session.`,
  };
}

function ioFailure(error: unknown): ArtifactStoreFailure {
  return {
    ok: false,
    code: 'io-error',
    message:
      error instanceof Error
        ? `The artifact could not be persisted: ${error.message}`
        : 'The artifact could not be persisted.',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
