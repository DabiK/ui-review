import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION } from '@core';
import { BRIDGE_VERSION } from '../../src/bridge/core/version';

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { version: string };

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../src/bridge/native-messaging-host/manifest.example.json', import.meta.url)),
    'utf8',
  ),
) as {
  name: string;
  description: string;
  path: string;
  type: string;
  allowed_origins: string[];
};

describe('native bridge release metadata', () => {
  it('keeps the bridge version in sync with package.json', () => {
    expect(BRIDGE_VERSION).toBe(packageJson.version);
  });

  it('ships a stdio Native Messaging host manifest template', () => {
    expect(manifest.name).toBe('com.dabik.ui_review_bridge');
    expect(manifest.type).toBe('stdio');
    expect(manifest.path).toMatch(/run-bridge/);
    expect(manifest.allowed_origins).toEqual(['chrome-extension://EXTENSION_ID/']);
  });

  it('uses a positive, integer protocol version', () => {
    expect(Number.isInteger(BRIDGE_PROTOCOL_VERSION)).toBe(true);
    expect(BRIDGE_PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
