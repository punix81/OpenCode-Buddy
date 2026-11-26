import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG, parseConfig, ConfigError } from '../src/config.js';

test('display preferences are owned by the device by default', () => {
  const config = parseConfig({});
  assert.equal(config.language, null);
  assert.equal(config.quietMode, null);
  assert.deepEqual(config, DEFAULT_CONFIG);
});

test('an explicit language and quiet override is validated', () => {
  const config = parseConfig({ language: 'fr', quietMode: true });
  assert.equal(config.language, 'fr');
  assert.equal(config.quietMode, true);
  assert.throws(() => parseConfig({ language: 'it' }), ConfigError);
  assert.throws(() => parseConfig({ quietMode: 'yes' }), ConfigError);
});
