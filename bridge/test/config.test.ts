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
