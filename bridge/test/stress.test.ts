import assert from 'node:assert/strict';
import test from 'node:test';

import { stressEvents } from '../src/adapters/stress.js';
import { normalizeEvent } from '../src/normalize/normalizer.js';
import { SessionRegistry } from '../src/state/registry.js';

const ctx = (now: number) => ({
  now,
  bridge: 'ready' as const,
  source: 'mock' as const,
  bridgeVersion: '0.2.0',
  protocol: 1,
});

test('a stress cycle resolves every interaction and tool on one session', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'opencode.connected', at: 0 });
  const start = 1000;

  for (let step = 0; step < 12; ++step) {
    const events = stressEvents(step, start + step * 200);
    assert.ok(events.length > 0);
    for (const event of events) {
      // The bridge re-normalizes every event: the default-deny filter must keep
      // it (including the exactly-40-character model name).
      assert.notEqual(normalizeEvent(event), null, `step ${step} ${event.kind}`);
      registry.apply(event);
    }
    if (step === 5) {
      const during = registry.snapshot(ctx(start + step * 200 + 1));
      assert.equal(during.status, 'permission_required');
      assert.equal(during.pendingPermissions, 1);
    }
    if (step === 6) {
      const after = registry.snapshot(ctx(start + step * 200 + 1));
      assert.equal(after.pendingPermissions, 0);
      assert.equal(after.status, 'working');
      assert.equal(after.tools?.running, 1);
    }
  }

  const end = registry.snapshot(ctx(start + 12 * 200 + 1));
  assert.equal(end.status, 'idle');
  assert.equal(end.pendingPermissions, 0);
  assert.equal(end.pendingQuestions, 0);
  assert.equal(end.tools?.running, 0);
  assert.ok((end.model ?? '').length <= 40);
});

test('the next cycle moves to the next session without leaving state behind', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'opencode.connected', at: 0 });
  for (let step = 0; step < 24; ++step) {
    for (const event of stressEvents(step, 1000 + step * 200)) registry.apply(event);
  }
  const end = registry.snapshot(ctx(1000 + 24 * 200 + 1));
  assert.equal(end.pendingPermissions, 0);
  assert.equal(end.pendingQuestions, 0);
  assert.equal(end.tools?.running, 0);
});
