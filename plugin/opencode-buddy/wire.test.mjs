import assert from 'node:assert/strict';
import test from 'node:test';

import { frameTooLarge, shouldDropForBackpressure } from './wire.js';
import { sanitize } from './index.js';

test('the frame limit is measured in UTF-8 bytes', () => {
  assert.equal(frameTooLarge('a'.repeat(8192)), false);
  assert.equal(frameTooLarge('é'.repeat(4097)), true); // 8194 bytes, 4097 units
});

test('only events are dropped for backpressure', () => {
  assert.equal(shouldDropForBackpressure(300 * 1024, 'event'), true);
  assert.equal(shouldDropForBackpressure(300 * 1024, 'heartbeat'), false);
  assert.equal(shouldDropForBackpressure(300 * 1024, 'hello'), false);
  assert.equal(shouldDropForBackpressure(1, 'event'), false);
});

test('diagnostic messages lose paths, identifiers and newlines', () => {
  assert.equal(sanitize('snapshot directory=/home/me/project sessions=3'), 'snapshot directory=<path> sessions=3');
  assert.equal(sanitize('event ses_0f5c1a2b3c4d5e6f7a8b9c0d projected=2'), 'event <id> projected=2');
  assert.equal(sanitize('a\nb\r\nc'), 'a b c');
  assert.ok(!sanitize('path C:\\Users\\me\\project').includes('Users'));
});
