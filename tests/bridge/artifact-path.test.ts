import { describe, expect, it } from 'vitest';
import { buildArtifactRelativePaths } from '../../src/bridge/core/artifact-path';

describe('buildArtifactRelativePaths', () => {
  it('builds the documented per-session layout', () => {
    const built = buildArtifactRelativePaths({ sessionId: 'session-1', name: 'shot.png' });

    expect(built).toEqual({
      ok: true,
      paths: {
        data: 'sessions/session-1/artifacts/shot.png',
        metadata: 'sessions/session-1/metadata/shot.png.json',
      },
    });
  });

  it('refuses session ids that could escape the storage root', () => {
    for (const sessionId of ['..', '../other', 'a/b', '/absolute', '.hidden', 'trailing.', 'CON']) {
      const built = buildArtifactRelativePaths({ sessionId, name: 'shot.png' });
      expect(built, sessionId).toMatchObject({ ok: false, code: 'invalid-session-id' });
    }
  });

  it('refuses artifact names that could escape the session folder', () => {
    for (const name of ['..', '../../etc/passwd', 'a/b', 'a\\b', '/etc/passwd', 'nul', 'x.']) {
      const built = buildArtifactRelativePaths({ sessionId: 'session-1', name });
      expect(built, name).toMatchObject({ ok: false, code: 'invalid-artifact-name' });
    }
  });

  it('never returns an absolute or parent-relative segment', () => {
    const built = buildArtifactRelativePaths({ sessionId: 'session-1', name: 'shot.png' });

    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.paths.data.startsWith('/')).toBe(false);
      expect(built.paths.data.includes('..')).toBe(false);
      expect(built.paths.metadata.startsWith('/')).toBe(false);
    }
  });
});
