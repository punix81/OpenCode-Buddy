import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitize } from '../src/logger.js';

test('counters are not mistaken for paths', () => {
  assert.equal(sanitize('tools=0/0/0'), 'tools=0/0/0');
  assert.equal(sanitize('tokens=1200/900'), 'tokens=1200/900');
});

test('absolute paths, URLs and e-mails are redacted', () => {
  assert.equal(sanitize('at /home/user/secret'), 'at [path]');
  assert.equal(sanitize('see https://internal.example/x'), 'see [url]');
  assert.equal(sanitize('mail a@b.example'), 'mail [email]');
});

test('control characters are removed', () => {
  assert.equal(sanitize('a\u0000b'), 'a b');
});
