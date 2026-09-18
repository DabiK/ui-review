import { describe, expect, it } from 'vitest';
import type {
  HandoffMaterializeInput,
  HandoffWriterPort,
} from '../../src/bridge/core/ports/handoff-writer';

export interface HandoffWriterContractOptions {
  /** Returns a writer backed by an isolated root; the same writer is reused per test. */
  readonly createWriter: () => Promise<HandoffWriterPort>;
  readonly disposeWriter?: (writer: HandoffWriterPort) => Promise<void>;
  readonly readFile: (
    writer: HandoffWriterPort,
    sessionId: string,
    name: string,
  ) => Promise<Uint8Array | null>;
  readonly fileNames: (writer: HandoffWriterPort, sessionId: string) => Promise<readonly string[]>;
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function writeInput(overrides: Partial<HandoffMaterializeInput> = {}): HandoffMaterializeInput {
  return {
    sessionId: 'session-1',
    reviewJson: '{"schemaVersion":1}\n',
    reviewMarkdown: '# UI Review brief\n',
    files: [{ name: '01-element-crop.png', mediaType: 'image/png', content: PNG_BYTES }],
    ...overrides,
  };
}

/** Behaviour every `HandoffWriterPort` implementation must provide. */
export function describeHandoffWriterPortContract(options: HandoffWriterContractOptions): void {
  describe('HandoffWriterPort contract', () => {
    it('plans absolute paths under the per-session directory', async () => {
      const writer = await options.createWriter();
      try {
        const planned = writer.plan({
          sessionId: 'session-1',
          fileNames: ['01-element-crop.png'],
        });

        expect(planned.ok).toBe(true);
        if (!planned.ok) {
          return;
        }
        expect(planned.plan.directory).toContain('session-1');
        expect(planned.plan.markdownPath).toBe(`${planned.plan.directory}/review.md`);
        expect(planned.plan.jsonPath).toBe(`${planned.plan.directory}/review.json`);
        expect(planned.plan.filePaths['01-element-crop.png']).toBe(
          `${planned.plan.directory}/01-element-crop.png`,
        );
      } finally {
        await options.disposeWriter?.(writer);
      }
    });

    it('materializes review.md, review.json and the images in one call', async () => {
      const writer = await options.createWriter();
      try {
        const outcome = await writer.materialize(writeInput());

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          return;
        }
        expect(outcome.handoff.directory).toContain('session-1');
        expect(outcome.handoff.files).toEqual([
          { name: '01-element-crop.png', path: `${outcome.handoff.directory}/01-element-crop.png`, byteLength: PNG_BYTES.byteLength },
        ]);
        expect(
          new TextDecoder().decode(
            (await options.readFile(writer, 'session-1', 'review.json')) ?? new Uint8Array(),
          ),
        ).toBe('{"schemaVersion":1}\n');
        expect(
          new TextDecoder().decode(
            (await options.readFile(writer, 'session-1', 'review.md')) ?? new Uint8Array(),
          ),
        ).toContain('# UI Review brief');
        expect(await options.readFile(writer, 'session-1', '01-element-crop.png')).toEqual(PNG_BYTES);
      } finally {
        await options.disposeWriter?.(writer);
      }
    });

    it('replaces the whole session directory instead of accumulating copies', async () => {
      const writer = await options.createWriter();
      try {
        await writer.materialize(writeInput());
        await writer.materialize(
          writeInput({
            reviewMarkdown: '# UI Review brief\n\nupdated\n',
            files: [{ name: '02-viewport.png', mediaType: 'image/png', content: PNG_BYTES }],
          }),
        );

        const names = [...(await options.fileNames(writer, 'session-1'))].sort();
        expect(names).toEqual(['02-viewport.png', 'review.json', 'review.md']);
        expect(await options.readFile(writer, 'session-1', '01-element-crop.png')).toBeNull();
        expect(
          new TextDecoder().decode(
            (await options.readFile(writer, 'session-1', 'review.md')) ?? new Uint8Array(),
          ),
        ).toContain('updated');
      } finally {
        await options.disposeWriter?.(writer);
      }
    });

    it('keeps sessions isolated from each other', async () => {
      const writer = await options.createWriter();
      try {
        await writer.materialize(writeInput());
        await writer.materialize(writeInput({ sessionId: 'session-2' }));

        expect(await options.fileNames(writer, 'session-1')).toHaveLength(3);
        expect(await options.fileNames(writer, 'session-2')).toHaveLength(3);
      } finally {
        await options.disposeWriter?.(writer);
      }
    });

    it('refuses unsafe session ids and file names without writing', async () => {
      const writer = await options.createWriter();
      try {
        const badSession = writer.plan({ sessionId: '../escape', fileNames: [] });
        const badName = writer.plan({ sessionId: 'session-1', fileNames: ['../escape.png'] });
        const reserved = writer.plan({ sessionId: 'session-1', fileNames: ['review.md'] });
        const badWrite = await writer.materialize(writeInput({ sessionId: '../../escape' }));

        expect(badSession).toMatchObject({ ok: false, code: 'invalid-session-id' });
        expect(badName).toMatchObject({ ok: false, code: 'invalid-artifact-name' });
        expect(reserved).toMatchObject({ ok: false, code: 'invalid-artifact-name' });
        expect(badWrite).toMatchObject({ ok: false, code: 'invalid-session-id' });
        expect(await options.fileNames(writer, 'session-1')).toEqual([]);
      } finally {
        await options.disposeWriter?.(writer);
      }
    });

    it('never throws for expected failures', async () => {
      const writer = await options.createWriter();
      try {
        await expect(writer.materialize(writeInput({ sessionId: '../x' }))).resolves.toBeDefined();
        expect(() => writer.plan({ sessionId: '../x', fileNames: [] })).not.toThrow();
      } finally {
        await options.disposeWriter?.(writer);
      }
    });
  });
}
