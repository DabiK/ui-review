import { describe, expect, it } from 'vitest';
import { InMemoryHandoffWriter } from '../../src/bridge/adapters/in-memory/in-memory-handoff-writer';
import { describeHandoffWriterPortContract } from './handoff-writer.contract';

describeHandoffWriterPortContract({
  createWriter: async () => new InMemoryHandoffWriter({ root: '/in-memory-handoff' }),
  readFile: async (writer, sessionId, name) =>
    (writer as InMemoryHandoffWriter).readFile(sessionId, name),
  fileNames: async (writer, sessionId) =>
    (writer as InMemoryHandoffWriter).fileNames(sessionId),
});

describe('InMemoryHandoffWriter', () => {
  it('exposes its root and forgets nothing between materializations', async () => {
    const writer = new InMemoryHandoffWriter({ root: '/memory-root' });

    const outcome = await writer.materialize({
      sessionId: 'session-1',
      reviewJson: '{}\n',
      reviewMarkdown: '# brief\n',
      files: [],
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.handoff.directory).toBe('/memory-root/session-1');
    }
    expect(writer.sessionIds()).toEqual(['session-1']);
  });
});
