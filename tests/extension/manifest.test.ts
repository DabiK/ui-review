import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ManifestShape {
  readonly manifest_version: number;
  readonly name: string;
  readonly version: string;
  readonly permissions: readonly string[];
  readonly host_permissions: readonly string[];
  readonly background: { readonly service_worker: string; readonly type: string };
  readonly content_scripts: readonly {
    readonly matches: readonly string[];
    readonly js: readonly string[];
    readonly run_at: string;
  }[];
  readonly side_panel: { readonly default_path: string };
}

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/manifest.json', import.meta.url)), 'utf8'),
) as ManifestShape;

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { version: string };

const readRepoFile = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');

describe('extension manifest', () => {
  it('is a Chrome MV3 side-panel extension', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.permissions).toContain('tabs');
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
  });

  it('keeps the extension version in sync with package.json', () => {
    expect(manifest.version).toBe(packageJson.version);
  });

  it('points at entry points that exist in the repository', () => {
    expect(readRepoFile(manifest.side_panel.default_path)).toContain('id="app"');
    expect(readRepoFile('src/background/service-worker.ts').length).toBeGreaterThan(0);
    expect(readRepoFile('src/content/index.ts').length).toBeGreaterThan(0);
  });

  it('declares the host permissions required to capture the reviewed page', () => {
    // `chrome.tabs.captureVisibleTab` accepts only `<all_urls>` or `activeTab`, and an
    // activeTab grant is lost on page reload while a review session survives it.
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  it('injects the overlay content script on http(s) pages only', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    const entry = manifest.content_scripts[0];
    expect(entry?.matches).toEqual(['http://*/*', 'https://*/*']);
    expect(entry?.js).toEqual(['content-script.js']);
    expect(entry?.run_at).toBe('document_idle');
  });
});
