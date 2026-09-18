/**
 * Tells whether a framework source reference already names an original source file.
 *
 * Development builds hand the original module path to React (`_debugSource.fileName`):
 * `webpack-internal:///./src/PricingCard.tsx`, `/src/main.tsx?t=123`, `file:///app/src/card.tsx`.
 * Those references are observed directly and need no source-map resolution. Anything else —
 * a hashed `.js` bundle, a `.mjs` chunk — is a compiled location: pretending it is a source
 * file would claim a component-file relationship the evidence does not support.
 */

const DIRECT_SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.jsx',
  '.vue',
  '.svelte',
  '.mdx',
] as const;

const WEBPACK_INTERNAL_SCHEME = 'webpack-internal:';

export function isDirectSourceReference(fileName: string): boolean {
  const trimmed = fileName.trim();
  if (trimmed === '') {
    return false;
  }

  const withoutQuery = stripQueryAndFragment(trimmed).toLowerCase();
  if (withoutQuery.startsWith(WEBPACK_INTERNAL_SCHEME)) {
    // Webpack exposes development modules under this scheme; they always name a source.
    return true;
  }
  return DIRECT_SOURCE_EXTENSIONS.some((extension) => withoutQuery.endsWith(extension));
}

function stripQueryAndFragment(value: string): string {
  const queryIndex = value.search(/[?#]/);
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}
