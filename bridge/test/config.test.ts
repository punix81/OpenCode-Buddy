import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DEFAULT_CONFIG, defaultConfigFile, parseConfig, ConfigError } from '../src/config.js';

test('display preferences are owned by the device by default', () => {
  const config = parseConfig({});
  assert.equal(config.language, null);
  assert.equal(config.quietMode, null);
  assert.equal(config.autoReturnSeconds, 60);
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test('auto return is bounded by the protocol limits', () => {
  assert.equal(parseConfig({ autoReturnSeconds: 10 }).autoReturnSeconds, 10);
  assert.equal(parseConfig({ autoReturnSeconds: 600 }).autoReturnSeconds, 600);
  assert.throws(() => parseConfig({ autoReturnSeconds: 9 }), ConfigError);
  assert.throws(() => parseConfig({ autoReturnSeconds: 601 }), ConfigError);
});

test('an explicit language and quiet override is validated', () => {
  const config = parseConfig({ language: 'fr', quietMode: true });
  assert.equal(config.language, 'fr');
  assert.equal(config.quietMode, true);
  assert.throws(() => parseConfig({ language: 'it' }), ConfigError);
  assert.throws(() => parseConfig({ quietMode: 'yes' }), ConfigError);
});

test('every field rejects an invalid value instead of silently defaulting', () => {
  const invalid: Record<string, unknown>[] = [
    { port: 12 },
    { autoDetect: 'yes' },
    { baudRate: 0 },
    { baudRate: 3_000_001 },
    { heartbeatMs: 249 },
    { heartbeatMs: 60_001 },
    { linkTimeoutMs: 499 },
    { linkTimeoutMs: 120_001 },
    { stateIntervalMs: 99 },
    { stateIntervalMs: 60_001 },
    { reconnectDelaysMs: [] },
    { reconnectDelaysMs: 'fast' },
    { reconnectDelaysMs: [99] },
    { reconnectDelaysMs: [300_001] },
    { logLevel: 'verbose' },
    { allowRealMcpNames: 'true' },
    { source: 'simulated' },
    { language: 'it' },
    { quietMode: 'yes' },
    { autoReturnSeconds: 601 },
  ];
  for (const value of invalid) {
    assert.throws(() => parseConfig(value), ConfigError, JSON.stringify(value));
  }
  assert.throws(() => parseConfig(null), ConfigError);
  assert.throws(() => parseConfig([]), ConfigError);
});

test('the configured port and explicit source are accepted', () => {
  const config = parseConfig({ port: '/dev/ttyACM0', source: 'mock', logLevel: 'debug' });
  assert.equal(config.port, '/dev/ttyACM0');
  assert.equal(config.source, 'mock');
  assert.equal(config.logLevel, 'debug');
  assert.equal(parseConfig({ port: null }).port, null);
});

test('unknown configuration keys are errors, not ignored', () => {
  assert.throws(() => parseConfig({ telemetry: true }), /unknown configuration key/);
  assert.throws(() => parseConfig({ deviceSerail: 'AA' }), /unknown configuration key/);
});

test('device selection, startup and diagnostics are validated', () => {
  const config = parseConfig({
    deviceSerial: 'AA:BB:CC',
    autoStart: true,
    diagnostics: true,
    mcpAliases: { files: 'FILES', github: 'GH' },
  });
  assert.equal(config.deviceSerial, 'AA:BB:CC');
  assert.equal(config.autoStart, true);
  assert.equal(config.diagnostics, true);
  assert.deepEqual(config.mcpAliases, { files: 'FILES', github: 'GH' });
  assert.throws(() => parseConfig({ deviceSerial: '' }), ConfigError);
  assert.throws(() => parseConfig({ autoStart: 'yes' }), ConfigError);
  assert.throws(() => parseConfig({ diagnostics: 1 }), ConfigError);
  assert.throws(() => parseConfig({ mcpAliases: { a: 'X', b: 'X' } }), /duplicates/);
  assert.throws(() => parseConfig({ mcpAliases: { a: 12 } }), ConfigError);
});

test('the development file wins when it exists; otherwise the platform path is used', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-config-'));
  try {
    assert.equal(defaultConfigFile({ XDG_CONFIG_HOME: '/tmp/xdg' }, 'linux', dir), join('/tmp/xdg', 'opencode-buddy', 'config.json'));
    assert.equal(defaultConfigFile({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32', dir), join('C:\\Users\\a\\AppData\\Roaming', 'opencode-buddy', 'config.json'));
    assert.equal(defaultConfigFile({ BUDDY_CONFIG: '/explicit.json' }, 'linux', dir), '/explicit.json');
    writeFileSync(join(dir, 'config.local.json'), '{}');
    assert.equal(defaultConfigFile({}, 'linux', dir), join(dir, 'config.local.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
