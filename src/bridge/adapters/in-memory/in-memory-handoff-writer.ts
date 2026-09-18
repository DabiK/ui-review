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

interface InMemoryHandoffRecord {
  readonly mediaType: string;
  readonly content: Uint8Array;
}

export interface InMemoryHandoffWriterOptions {
  readonly root?: string;
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Portable handoff writer used by tests and by the in-process bridge adapter. It shares the
 * path rules and the "replace the whole session directory" semantics of the filesystem
 * writer, so the double cannot drift from the real materializer.
 */
export class InMemoryHandoffWriter implements HandoffWriterPort {
  readonly root: string;

  private readonly sessions = new Map<string, Map<string, InMemoryHandoffRecord>>();

  constructor(options: InMemoryHandoffWriterOptions = {}) {
    this.root = options.root ?? '/ui-review-handoff';
  }

  plan(input: PlanHandoffInput): HandoffPlanResult {
    if (!isSafeArtifactSessionId(input.sessionId)) {
      return failure('invalid-session-id', 'The session id cannot be used as a handoff folder.');
    }
    const directory = `${this.root.replace(/\/+$/, '')}/${input.sessionId}`;
    const filePaths: Record<string, string> = {};
    for (const name of input.fileNames) {
      if (!isSafeReviewBriefFileName(name)) {
        return failure(
          'invalid-artifact-name',
          `The handoff file name "${name}" cannot be used in a directory.`,
        );
      }
      filePaths[name] = `${directory}/${name}`;
    }

    return {
      ok: true,
      plan: {
        sessionId: input.sessionId,
        directory,
        markdownPath: `${directory}/${REVIEW_BRIEF_MARKDOWN_FILE}`,
        jsonPath: `${directory}/${REVIEW_BRIEF_JSON_FILE}`,
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

    const records = new Map<string, InMemoryHandoffRecord>();
    records.set(REVIEW_BRIEF_JSON_FILE, {
      mediaType: 'application/json',
      content: TEXT_ENCODER.encode(input.reviewJson),
    });
    records.set(REVIEW_BRIEF_MARKDOWN_FILE, {
      mediaType: 'text/markdown',
      content: TEXT_ENCODER.encode(input.reviewMarkdown),
    });

    const files: HandoffMaterializedFile[] = [];
    for (const file of input.files) {
      const content = new Uint8Array(file.content);
      records.set(file.name, { mediaType: file.mediaType, content });
      files.push({
        name: file.name,
        path: `${planned.plan.directory}/${file.name}`,
        byteLength: content.byteLength,
      });
    }

    this.sessions.set(input.sessionId, records);

    return {
      ok: true,
      handoff: handoffOf(input.sessionId, planned.plan.directory, files),
    };
  }

  /** Introspection for tests and in-process previews: exact bytes written for one file. */
  readFile(sessionId: string, name: string): Uint8Array | null {
    const record = this.sessions.get(sessionId)?.get(name);
    return record === undefined ? null : new Uint8Array(record.content);
  }

  /** Every file name currently materialized for the session, in directory order. */
  fileNames(sessionId: string): readonly string[] {
    return [...(this.sessions.get(sessionId)?.keys() ?? [])];
  }

  /** Session directories currently materialized, for idempotence assertions. */
  sessionIds(): readonly string[] {
    return [...this.sessions.keys()];
  }
}

function handoffOf(
  sessionId: string,
  directory: string,
  files: readonly HandoffMaterializedFile[],
): MaterializedHandoff {
  return {
    sessionId,
    directory,
    markdownPath: `${directory}/${REVIEW_BRIEF_MARKDOWN_FILE}`,
    jsonPath: `${directory}/${REVIEW_BRIEF_JSON_FILE}`,
    files,
  };
}

function failure(code: HandoffWriterFailure['code'], message: string): HandoffWriterFailure {
  return { ok: false, code, message };
}
