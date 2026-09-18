import type { ReviewBriefImageMediaType } from '../../../core/handoff/review-brief';
import type { BridgeErrorCode } from '../../../core/bridge/protocol';

/**
 * Driven port of the native bridge: materializes one agent handoff into a per-session
 * temporary directory. The bridge core decides what a handoff contains; the adapter only
 * knows how to plan platform paths and persist bytes. Expected failures are typed values.
 */
export type HandoffWriterErrorCode = Extract<
  BridgeErrorCode,
  'invalid-session-id' | 'invalid-artifact-name' | 'path-not-allowed' | 'io-error'
>;

export interface HandoffWriterFailure {
  readonly ok: false;
  readonly code: HandoffWriterErrorCode;
  readonly message: string;
}

export interface HandoffWriteFile {
  readonly name: string;
  readonly mediaType: ReviewBriefImageMediaType;
  readonly content: Uint8Array;
}

export interface HandoffMaterializeInput {
  readonly sessionId: string;
  /** Canonical serialized `review.json` content. */
  readonly reviewJson: string;
  /** Rendered `review.md` content, the exact text returned for the clipboard. */
  readonly reviewMarkdown: string;
  readonly files: readonly HandoffWriteFile[];
}

export interface HandoffMaterializedFile {
  readonly name: string;
  readonly path: string;
  readonly byteLength: number;
}

export interface MaterializedHandoff {
  readonly sessionId: string;
  readonly directory: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
  readonly files: readonly HandoffMaterializedFile[];
}

/** Absolute paths of one planned handoff; the renderer uses them without knowing the OS. */
export interface HandoffPlan {
  readonly sessionId: string;
  readonly directory: string;
  readonly markdownPath: string;
  readonly jsonPath: string;
  readonly filePaths: Readonly<Record<string, string>>;
}

export type HandoffPlanResult =
  | { readonly ok: true; readonly plan: HandoffPlan }
  | HandoffWriterFailure;

export interface PlanHandoffInput {
  readonly sessionId: string;
  readonly fileNames: readonly string[];
}

export interface HandoffWriterPort {
  /**
   * Pure path planning: repeated exports of the same session target the same directory.
   * Returns a typed failure for unsafe segments instead of throwing.
   */
  plan(input: PlanHandoffInput): HandoffPlanResult;
  /**
   * Writes `review.json`, `review.md` and the image files, replacing the previous content of
   * the session directory so no stale file or unbounded copy survives. `review.md` is written
   * last, after every image it references exists.
   */
  materialize(
    input: HandoffMaterializeInput,
  ): Promise<{ readonly ok: true; readonly handoff: MaterializedHandoff } | HandoffWriterFailure>;
}
