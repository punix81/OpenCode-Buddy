import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG, parseConfig, ConfigError } from '../src/config.js';

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
