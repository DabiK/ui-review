import { InMemoryClipboardAdapter } from '@adapters/runtime/in-memory-clipboard';
import { describeClipboardPortContract } from './clipboard.contract';

describeClipboardPortContract({
  createHarness: () => {
    const adapter = new InMemoryClipboardAdapter();
    return { port: adapter, writtenText: () => adapter.lastWrittenText() };
  },
  createFailingHarness: () => {
    const adapter = new InMemoryClipboardAdapter({
      failureMessage: 'Clipboard access was denied.',
    });
    return { port: adapter, writtenText: () => adapter.lastWrittenText() };
  },
});
