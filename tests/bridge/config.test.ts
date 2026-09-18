import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from '../../src/bridge/core/config';

describe('parseAllowedOrigins', () => {
  it('fails closed when unset or blank', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins(' , , ')).toEqual([]);
  });

  it('splits, trims and deduplicates origins', () => {
    expect(
      parseAllowedOrigins('chrome-extension://aaa/, chrome-extension://bbb/ ,chrome-extension://aaa/'),
    ).toEqual(['chrome-extension://aaa/', 'chrome-extension://bbb/']);
  });
});
