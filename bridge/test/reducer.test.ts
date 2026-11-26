import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRegistry } from '../src/state/registry.js';
import type { ReduceContext } from '../src/state/reducer.js';

const ctx = (now: number): ReduceContext => ({
  now,
  bridge: 'ready',
  source: 'live',
  bridgeVersion: '0.2.0',
  protocol: 1,
});

test('permission outranks tool execution across sessions', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'session.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'session.started', sessionId: 's2', at: 1000 });
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'phase', sessionId: 's1', at: 1100, status: 'working' });
  registry.apply({ kind: 'permission.asked', sessionId: 's2', at: 1200 });

  const state = registry.snapshot(ctx(1300));
  assert.equal(state.status, 'permission_required');
  assert.equal(state.activeSessions, 2);
  assert.equal(state.pendingPermissions, 1);
});

test('a tool failure does not raise the execution error state', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'tool.started', sessionId: 's1', at: 1100, toolId: 'read-1', category: 'read' });
  registry.apply({ kind: 'tool.failed', sessionId: 's1', at: 1200, toolId: 'read-1', category: 'read' });

  let state = registry.snapshot(ctx(1300));
  assert.notEqual(state.status, 'error');
  assert.equal(state.tools?.failed, 1);
  assert.equal(state.tools?.running, 0);

  registry.apply({ kind: 'execution.failed', sessionId: 's1', at: 1400 });
  state = registry.snapshot(ctx(1500));
  assert.equal(state.status, 'error');
});

test('terminal success expires after its TTL', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });

  assert.equal(registry.snapshot(ctx(2100)).status, 'success');
  assert.equal(registry.snapshot(ctx(2000 + 4001)).status, 'idle');
});

test('interrupted expires after its TTL', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.interrupted', sessionId: 's1', at: 2000 });
  assert.equal(registry.snapshot(ctx(3000)).status, 'interrupted');
  assert.equal(registry.snapshot(ctx(2000 + 10001)).status, 'idle');
});

test('token usage keeps the maximum cumulative value', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1100, input: 100, output: 50 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1200, input: 120, output: 60 });

  const state = registry.snapshot(ctx(1300));
  assert.equal(state.tokens?.input, 120);
  assert.equal(state.tokens?.output, 60);
  assert.equal(state.tokens?.total, 180);
});

test('tool calls are deduplicated', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'tool.started', sessionId: 's1', at: 1100, toolId: 't1', messageId: 'm1', category: 'edit' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 's1', at: 1200, toolId: 't1', messageId: 'm1', category: 'edit' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 's1', at: 1300, toolId: 't1', messageId: 'm1', category: 'edit' });

  const state = registry.snapshot(ctx(1400));
  assert.equal(state.tools?.success, 1);
  assert.equal(state.tools?.failed, 0);
  assert.equal(state.tools?.categories?.edit, 1);
});

test('unavailable tokens are explicit nulls', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'session.started', sessionId: 's1', at: 1000 });
  const state = registry.snapshot(ctx(1100));
  assert.equal(state.tokens?.input, null);
  assert.equal(state.tokens?.output, null);
  assert.equal(state.tokens?.total, null);
});

test('opencode and mcp values are carried through', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'opencode.connected', at: 1000 });
  registry.apply({
    kind: 'mcp.status',
    at: 1000,
    online: 1,
    total: 2,
    servers: [{ alias: 'MCP-1', status: 'connected' }],
  });
  const state = registry.snapshot(ctx(1000));
  assert.equal(state.connection.opencode, 'connected');
  assert.deepEqual(state.mcp, { online: 1, total: 2 });
});

test('a degraded bridge reports offline', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  const state = registry.snapshot({ ...ctx(1100), bridge: 'degraded' });
  assert.equal(state.status, 'offline');
});

test('elapsed time runs while the execution is active', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  assert.equal(registry.snapshot(ctx(11000)).elapsedSeconds, 10);
});

test('elapsed time freezes on the terminal duration, then reads zero', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 8000 });

  assert.equal(registry.snapshot(ctx(9000)).elapsedSeconds, 7);
  assert.equal(registry.snapshot(ctx(8000 + 4001)).elapsedSeconds, 0);
});

test('a phase seen without execution.started starts the chronometer', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'phase', sessionId: 's1', at: 5000, status: 'thinking' });

  const state = registry.snapshot(ctx(9000));
  assert.equal(state.status, 'thinking');
  assert.equal(state.elapsedSeconds, 4);
});

test('a new execution after idle restarts the chronometer', () => {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });
  registry.apply({ kind: 'session.idle', sessionId: 's1', at: 2500 });
  assert.equal(registry.snapshot(ctx(3000)).elapsedSeconds, 0);

  registry.apply({ kind: 'phase', sessionId: 's1', at: 5000, status: 'thinking' });
  assert.equal(registry.snapshot(ctx(7000)).elapsedSeconds, 2);
});
