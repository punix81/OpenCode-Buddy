import assert from 'node:assert/strict';
import test from 'node:test';

import { SUPERVISOR_MAX_MS, SUPERVISOR_MIN_MS, nextDelay } from '../lib/supervisor.mjs';

test('startup backoff is exponential and bounded', () => {
  assert.equal(nextDelay(0), SUPERVISOR_MIN_MS);
  assert.equal(nextDelay(SUPERVISOR_MIN_MS), SUPERVISOR_MIN_MS * 2);
  let delay = 0;
  for (let i = 0; i < 20; ++i) delay = nextDelay(delay);
  assert.equal(delay, SUPERVISOR_MAX_MS);
});
