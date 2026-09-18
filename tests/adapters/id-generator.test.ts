import { describe, expect, it } from 'vitest';
import { CryptoIdGeneratorAdapter } from '@adapters/runtime/crypto-id-generator';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { describeIdGeneratorPortContract } from './id-generator.contract';

describeIdGeneratorPortContract({
  createGenerator: () => new CryptoIdGeneratorAdapter(),
});

describeIdGeneratorPortContract({
  createGenerator: () => new SequentialIdGeneratorAdapter('session'),
});

describe('SequentialIdGeneratorAdapter', () => {
  it('produces prefixed ids in order', () => {
    const generator = new SequentialIdGeneratorAdapter('session');

    expect([generator.createId(), generator.createId()]).toEqual(['session-1', 'session-2']);
  });
});

describe('CryptoIdGeneratorAdapter', () => {
  it('produces UUID-shaped ids', () => {
    expect(new CryptoIdGeneratorAdapter().createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
