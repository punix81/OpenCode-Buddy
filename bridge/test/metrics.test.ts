import assert from 'node:assert/strict';
import test from 'node:test';

import { MetricsManager } from '../src/metrics/metrics.js';

test('tool counters are deduplicated and running is balanced', () => {
  const metrics = new MetricsManager();
  assert.equal(metrics.recordTool('s1', 'm1', 't1', 'started', 'read'), true);
  assert.equal(metrics.recordTool('s1', 'm1', 't1', 'started', 'read'), false);
  assert.equal(metrics.recordTool('s1', 'm1', 't1', 'succeeded', 'read'), true);
  assert.equal(metrics.recordTool('s1', 'm1', 't1', 'succeeded', 'read'), false);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.tools.success, 1);
  assert.equal(snapshot.tools.failed, 0);
  assert.equal(snapshot.tools.running, 0);
  assert.equal(snapshot.tools.categories.read, 1);
});

test('usage keeps the maximum per session', () => {
  const metrics = new MetricsManager();
  metrics.recordUsage('s1', { input: 100, output: 50 });
  metrics.recordUsage('s1', { input: 80, output: 40 });
  metrics.recordUsage('s2', { input: 20, output: 10 });

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.tokens.input, 120);
  assert.equal(snapshot.tokens.output, 60);
  assert.equal(snapshot.tokens.total, 180);
});

test('no usage means unavailable, not zero', () => {
  const metrics = new MetricsManager();
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.tokens.input, null);
  assert.equal(snapshot.tokens.output, null);
  assert.equal(snapshot.tokens.total, null);
});
