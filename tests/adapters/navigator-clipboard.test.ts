// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigatorClipboardAdapter } from '@adapters/runtime/navigator-clipboard';
import { describeClipboardPortContract } from './clipboard.contract';

interface ClipboardHarness {
  readonly written: string[];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubClipboard(options: { readonly reject?: string } = {}): ClipboardHarness {
  const written: string[] = [];
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: (text: string) => {
        if (options.reject !== undefined) {
          return Promise.reject(new Error(options.reject));
        }
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return { written };
}

describeClipboardPortContract({
  createHarness: () => {
    const harness = stubClipboard();
    return {
      port: new NavigatorClipboardAdapter(),
      writtenText: () => harness.written.at(-1) ?? null,
    };
  },
  createFailingHarness: () => {
    const harness = stubClipboard({ reject: 'Document is not focused.' });
    return {
      port: new NavigatorClipboardAdapter(),
      writtenText: () => harness.written.at(-1) ?? null,
    };
  },
});

describe('NavigatorClipboardAdapter', () => {
  it('reports a missing Clipboard API as an unavailable clipboard', async () => {
    vi.stubGlobal('navigator', {});

    const result = await new NavigatorClipboardAdapter().writeText('brief');

    expect(result).toMatchObject({ ok: false, reason: 'clipboard-unavailable' });
  });

  it('includes the browser error message when the write is refused', async () => {
    stubClipboard({ reject: 'Document is not focused.' });

    const result = await new NavigatorClipboardAdapter().writeText('brief');

    expect(result).toMatchObject({ ok: false, reason: 'clipboard-unavailable' });
    if (!result.ok) {
      expect(result.message).toContain('Document is not focused.');
    }
  });
});
