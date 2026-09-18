/**
 * Identity source for new domain records. The core never generates ids from ambient
 * randomness: adapters provide them (crypto-backed in production, sequential in tests).
 */
export interface IdGeneratorPort {
  createId(): string;
}
