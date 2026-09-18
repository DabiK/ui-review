import type { IdGeneratorPort } from '@core';

/** Production id generator backed by the Web Crypto API. */
export class CryptoIdGeneratorAdapter implements IdGeneratorPort {
  createId(): string {
    return globalThis.crypto.randomUUID();
  }
}
