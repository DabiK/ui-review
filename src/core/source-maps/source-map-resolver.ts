import { decodeBase64 } from '../bridge/base64';

/**
 * Pure Source Map v3 reading: find the `sourceMappingURL` of a compiled file, decode inline
 * maps, validate the map document and resolve a generated position to an original source
 * position using base64 VLQ mappings.
 *
 * The core never fetches anything — adapters own I/O and hand raw text to these functions.
 * Only `sources` and `mappings` are kept: `sourcesContent` is deliberately dropped so
 * original source text never leaves the page's build output.
 */

export interface SourceMapDocument {
  readonly sources: readonly string[];
  readonly mappings: string;
  readonly sourceRoot: string | null;
}

export interface ResolvedSourcePosition {
  /** Original source entry exactly as published by the map (not rewritten). */
  readonly source: string;
  /** 1-based line in the original source. */
  readonly line: number;
  /** 1-based column in the original source. */
  readonly column: number;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_VALUES = (() => {
  const values = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    values[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return values;
})();

const SOURCE_MAPPING_URL_PATTERN =
  /\/\/[#@][ \t]*sourceMappingURL=([^\s'"]+)|\/\*[#@][ \t]*sourceMappingURL=([^\s*'"]+)[ \t]*\*\//g;

const MAX_SOURCES = 50_000;
const MAX_MAPPINGS_LENGTH = 8_000_000;
const MAX_INLINE_SOURCE_MAP_LENGTH = 16_000_000;

/** Last `sourceMappingURL` comment wins, as the Source Map v3 specification requires. */
export function findSourceMappingUrl(source: string): string | null {
  let found: string | null = null;
  for (const match of source.matchAll(SOURCE_MAPPING_URL_PATTERN)) {
    const candidate = match[1] ?? match[2];
    if (candidate !== undefined) {
      found = candidate;
    }
  }
  return found;
}

/** Decodes a `data:` source-map reference; `null` for anything else or invalid bytes. */
export function decodeInlineSourceMap(reference: string): string | null {
  if (!reference.startsWith('data:')) {
    return null;
  }
  const comma = reference.indexOf(',');
  if (comma === -1) {
    return null;
  }

  const metadata = reference.slice(5, comma);
  const payload = reference.slice(comma + 1);
  if (payload.length > MAX_INLINE_SOURCE_MAP_LENGTH) {
    return null;
  }

  if (metadata.includes(';base64')) {
    const decoded = decodeBase64(payload);
    return decoded.ok ? new TextDecoder().decode(decoded.bytes) : null;
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/** Validates the shape of a parsed source map; `null` means unusable, never "best effort". */
export function parseSourceMapDocument(value: unknown): SourceMapDocument | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record['version'] !== 3) {
    return null;
  }

  const mappings = record['mappings'];
  if (typeof mappings !== 'string' || mappings.length > MAX_MAPPINGS_LENGTH) {
    return null;
  }

  const sources = record['sources'];
  if (!Array.isArray(sources) || sources.length > MAX_SOURCES) {
    return null;
  }
  if (!sources.every((source) => typeof source === 'string')) {
    return null;
  }

  const sourceRoot = record['sourceRoot'];
  if (sourceRoot !== undefined && sourceRoot !== null && typeof sourceRoot !== 'string') {
    return null;
  }

  return { sources: [...sources], mappings, sourceRoot: sourceRoot ?? null };
}

/**
 * Resolves a generated position to the greatest mapping at or before it. `generatedLine` is
 * 1-based and `generatedColumn` is 1-based (both as stored on evidence). Returns `null` when
 * no mapping applies, so callers can record an explicit unavailable result.
 */
export function resolveSourceMapPosition(
  map: SourceMapDocument,
  generatedLine: number | null,
  generatedColumn: number | null,
): ResolvedSourcePosition | null {
  if (generatedLine === null || !Number.isInteger(generatedLine) || generatedLine < 1) {
    return null;
  }

  const targetLine = generatedLine - 1;
  const targetColumn = Math.max(0, (generatedColumn ?? 1) - 1);

  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let best: { readonly sourceIndex: number; readonly line: number; readonly column: number } | null =
    null;

  const lines = map.mappings.split(';');
  for (let lineIndex = 0; lineIndex <= targetLine && lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    let generatedColumnCursor = 0;

    for (const segment of line.split(',')) {
      if (segment === '') {
        continue;
      }
      const fields = decodeVlqSegment(segment);
      if (fields === null) {
        return null;
      }

      generatedColumnCursor += fields[0] ?? 0;
      if (generatedColumnCursor < 0) {
        return null;
      }
      if (fields.length < 4) {
        // Generated-only segment: advances the column cursor but maps no source.
        continue;
      }

      sourceIndex += fields[1] ?? 0;
      sourceLine += fields[2] ?? 0;
      sourceColumn += fields[3] ?? 0;

      const withinTarget =
        lineIndex < targetLine ||
        (lineIndex === targetLine && generatedColumnCursor <= targetColumn);
      if (withinTarget && sourceIndex >= 0 && sourceLine >= 0 && sourceColumn >= 0) {
        best = { sourceIndex, line: sourceLine, column: sourceColumn };
      }
    }
  }

  if (best === null) {
    return null;
  }
  const source = map.sources[best.sourceIndex];
  if (source === undefined || source.trim() === '') {
    return null;
  }
  return { source, line: best.line + 1, column: best.column + 1 };
}

/** Base64 VLQ segment decoder; `null` for malformed segments instead of guessing bytes. */
function decodeVlqSegment(segment: string): number[] | null {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  let pending = false;

  for (let index = 0; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    const digit = code < 128 ? (BASE64_VALUES[code] ?? -1) : -1;
    if (digit < 0) {
      return null;
    }

    pending = (digit & 32) !== 0;
    value += (digit & 31) << shift;
    if (pending) {
      shift += 5;
      if (shift > 30) {
        return null;
      }
      continue;
    }

    const negative = (value & 1) === 1;
    const magnitude = value >>> 1;
    values.push(negative ? -magnitude : magnitude);
    value = 0;
    shift = 0;
  }

  return pending ? null : values;
}
