import {
  decodeInlineSourceMap,
  findSourceMappingUrl,
  parseSourceMapDocument,
  resolveSourceMapPosition,
  type SourceMapContextPort,
  type SourceMapContextRequest,
  type SourceMapDocument,
  type SourceMapResolution,
} from '@core';

/**
 * Chrome adapter that resolves a compiled reference through the source map published next to
 * it. It runs in the extension context only, on demand, after an active review accepted a
 * note: no page is ever inspected or fetched for passively. Host permissions already granted
 * for screenshots allow the request; it is a plain GET, without credentials or custom
 * headers, and the fetched bytes are never stored — only the resolved file/line is kept.
 *
 * Every failure (missing map, HTTP error, invalid JSON, unmapped position, oversize) is an
 * explicit `unavailable` resolution; a `mapped` result always keeps the adapter's reason so
 * the core can label it as inferred rather than exact source truth.
 */

export interface SourceMapFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type SourceMapFetch = (url: string) => Promise<SourceMapFetchResponse>;

export interface ChromeSourceMapContextAdapterOptions {
  /** Test seam; defaults to the extension's global `fetch`. */
  readonly fetch?: SourceMapFetch;
  readonly maxCompiledCharacters?: number;
  readonly maxSourceMapCharacters?: number;
}

const DEFAULT_MAX_COMPILED_CHARACTERS = 8_000_000;
const DEFAULT_MAX_SOURCE_MAP_CHARACTERS = 16_000_000;

export class ChromeSourceMapContextAdapter implements SourceMapContextPort {
  private readonly doFetch: SourceMapFetch;
  private readonly maxCompiledCharacters: number;
  private readonly maxSourceMapCharacters: number;

  constructor(options: ChromeSourceMapContextAdapterOptions = {}) {
    this.doFetch = options.fetch ?? ((url) => globalThis.fetch(url));
    this.maxCompiledCharacters = options.maxCompiledCharacters ?? DEFAULT_MAX_COMPILED_CHARACTERS;
    this.maxSourceMapCharacters =
      options.maxSourceMapCharacters ?? DEFAULT_MAX_SOURCE_MAP_CHARACTERS;
  }

  async resolve(request: SourceMapContextRequest): Promise<SourceMapResolution> {
    try {
      const fileUrl = fetchableUrl(request.reference.fileName, request.pageUrl);
      if (fileUrl === null) {
        return unavailable('The source reference is not a readable http(s) URL.');
      }

      const compiled = await this.readText(fileUrl, this.maxCompiledCharacters);
      if (!compiled.ok) {
        return unavailable(`The compiled file could not be read (${fileUrl}).`);
      }

      const mapReference = findSourceMappingUrl(compiled.text);
      if (mapReference === null) {
        return unavailable(`No source map is published for ${fileUrl}.`);
      }

      const mapText = await this.readSourceMap(mapReference, fileUrl);
      if (mapText === null) {
        return unavailable(`The source map of ${fileUrl} could not be read.`);
      }

      const map = parseSourceMapJson(mapText);
      if (map === null) {
        return unavailable(`The source map of ${fileUrl} is invalid.`);
      }

      const position = resolveSourceMapPosition(
        map,
        request.reference.line,
        request.reference.column,
      );
      if (position === null) {
        return unavailable(`The source map of ${fileUrl} has no mapping for the reported line.`);
      }

      return {
        kind: 'mapped',
        sourceFile: position.source,
        line: position.line,
        column: position.column,
        reason: `Resolved from the source map of ${fileUrl}.`,
      };
    } catch {
      return unavailable('The source map could not be resolved.');
    }
  }

  private async readSourceMap(mapReference: string, fileUrl: string): Promise<string | null> {
    if (mapReference.startsWith('data:')) {
      return decodeInlineSourceMap(mapReference);
    }

    const mapUrl = fetchableUrl(mapReference, fileUrl);
    if (mapUrl === null) {
      return null;
    }
    const fetched = await this.readText(mapUrl, this.maxSourceMapCharacters);
    return fetched.ok ? fetched.text : null;
  }

  private async readText(
    url: string,
    maxCharacters: number,
  ): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
    try {
      const response = await this.doFetch(url);
      if (!response.ok) {
        return { ok: false };
      }
      const text = await response.text();
      if (text.length === 0 || text.length > maxCharacters) {
        return { ok: false };
      }
      return { ok: true, text };
    } catch {
      return { ok: false };
    }
  }
}

function fetchableUrl(reference: string, base: string): string | null {
  if (reference.trim() === '') {
    return null;
  }
  try {
    const url = new URL(reference, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.username !== '' || url.password !== '') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function parseSourceMapJson(text: string): SourceMapDocument | null {
  try {
    return parseSourceMapDocument(JSON.parse(text));
  } catch {
    return null;
  }
}

function unavailable(reason: string): SourceMapResolution {
  return { kind: 'unavailable', reason };
}
