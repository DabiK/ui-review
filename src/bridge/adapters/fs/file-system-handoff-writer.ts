import { lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { isSafeArtifactSessionId } from '../../../core/bridge/slug';
import {
  REVIEW_BRIEF_JSON_FILE,
  REVIEW_BRIEF_MARKDOWN_FILE,
  isSafeReviewBriefFileName,
} from '../../../core/handoff/review-brief';
import type {
  HandoffMaterializeInput,
  HandoffMaterializedFile,
  HandoffPlanResult,
  HandoffWriterFailure,
  HandoffWriterPort,
  MaterializedHandoff,
  PlanHandoffInput,
} from '../../core/ports/handoff-writer';

export interface FileSystemHandoffWriterOptions {
  /** Absolute temporary root; usually `<OS temp>/ui-review/handoff`. */
  readonly root: string;
}

/**
 * Production handoff writer. Each session owns one directory under the temporary root, and
 * every materialization replaces its whole content: `review.md`, `review.json` and the
 * referenced images, with `review.md` written last so it never points at a missing image.
 * Paths are planned by the pure rules, then checked again after symlink resolution.
 */
export class FileSystemHandoffWriter implements HandoffWriterPort {
  readonly root: string;

  constructor(options: FileSystemHandoffWriterOptions) {
    if (!isAbsolute(options.root)) {
      throw new Error('The handoff root must be an absolute path.');
    }
    this.root = resolve(options.root);
  }

  plan(input: PlanHandoffInput): HandoffPlanResult {
    if (!isSafeArtifactSessionId(input.sessionId)) {
      return failure('invalid-session-id', 'The session id cannot be used as a handoff folder.');
    }
    const directory = join(this.root, input.sessionId);
    if (!isWithin(this.root, directory)) {
      return pathFailure();
    }

    const filePaths: Record<string, string> = {};
    for (const name of input.fileNames) {
      if (!isSafeReviewBriefFileName(name)) {
        return failure(
          'invalid-artifact-name',
          `The handoff file name "${name}" cannot be used in a directory.`,
        );
      }
      filePaths[name] = join(directory, name);
    }

    return {
      ok: true,
      plan: {
        sessionId: input.sessionId,
        directory,
        markdownPath: join(directory, REVIEW_BRIEF_MARKDOWN_FILE),
        jsonPath: join(directory, REVIEW_BRIEF_JSON_FILE),
        filePaths,
      },
    };
  }

  async materialize(
    input: HandoffMaterializeInput,
  ): Promise<
    { readonly ok: true; readonly handoff: MaterializedHandoff } | HandoffWriterFailure
  > {
    const planned = this.plan({
      sessionId: input.sessionId,
      fileNames: input.files.map((file) => file.name),
    });
    if (!planned.ok) {
      return planned;
    }
    const directory = planned.plan.directory;

    const entries: Array<{ readonly name: string; readonly content: Uint8Array | string }> = [
      ...input.files.map((file) => ({ name: file.name, content: file.content })),
      { name: REVIEW_BRIEF_JSON_FILE, content: input.reviewJson },
      { name: REVIEW_BRIEF_MARKDOWN_FILE, content: input.reviewMarkdown },
    ];

    try {
      await mkdir(this.root, { recursive: true });
      const rootReal = await realpath(this.root);

      await mkdir(directory, { recursive: true });
      const directoryReal = await realpath(directory);
      if (!isWithin(rootReal, directoryReal)) {
        return pathFailure();
      }

      for (const entry of entries) {
        const existing = await lstatOrNull(join(directory, entry.name));
        if (existing?.isSymbolicLink() === true) {
          return pathFailure();
        }
      }

      for (const entry of entries) {
        await writeFile(join(directory, entry.name), entry.content);
      }

      const keep = new Set(entries.map((entry) => entry.name));
      for (const stale of await readdir(directory)) {
        if (!keep.has(stale)) {
          await rm(join(directory, stale), { recursive: true, force: true });
        }
      }

      const files: HandoffMaterializedFile[] = input.files.map((file) => ({
        name: file.name,
        path: join(directory, file.name),
        byteLength: file.content.byteLength,
      }));

      return {
        ok: true,
        handoff: {
          sessionId: input.sessionId,
          directory,
          markdownPath: planned.plan.markdownPath,
          jsonPath: planned.plan.jsonPath,
          files,
        },
      };
    } catch (error) {
      return ioFailure(error);
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

async function lstatOrNull(path: string) {
  return lstat(path).catch(() => null);
}

function pathFailure(): HandoffWriterFailure {
  return {
    ok: false,
    code: 'path-not-allowed',
    message: 'The handoff path escapes the temporary handoff root.',
  };
}

function failure(code: HandoffWriterFailure['code'], message: string): HandoffWriterFailure {
  return { ok: false, code, message };
}

function ioFailure(error: unknown): HandoffWriterFailure {
  return {
    ok: false,
    code: 'io-error',
    message:
      error instanceof Error
        ? `The handoff could not be written: ${error.message}`
        : 'The handoff could not be written.',
  };
}
