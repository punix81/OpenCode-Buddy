import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRegistry } from '../src/state/registry.js';
import type { ReduceContext } from '../src/state/reducer.js';
import { SESSION_TTL_MS } from '../src/state/registry.js';

const ctx = (now: number): ReduceContext => ({
  now,
  bridge: 'ready',
  source: 'live',
  bridgeVersion: '0.2.0',
  protocol: 1,
});

// A live session is only reachable through a connected OpenCode peer. Tests that
// exercise the reducer start from that state.
function liveRegistry(): SessionRegistry {
  const registry = new SessionRegistry();
  registry.apply({ kind: 'opencode.connected', at: 0 });
  return registry;
}

test('permission outranks tool execution across sessions', () => {
  const registry = liveRegistry();
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
  const registry = liveRegistry();
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
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });

  assert.equal(registry.snapshot(ctx(2100)).status, 'success');
  assert.equal(registry.snapshot(ctx(2000 + 4001)).status, 'idle');
});

test('interrupted expires after its TTL', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.interrupted', sessionId: 's1', at: 2000 });
  assert.equal(registry.snapshot(ctx(3000)).status, 'interrupted');
  assert.equal(registry.snapshot(ctx(2000 + 10001)).status, 'idle');
});

test('interruption freezes the duration for its notification, then clears it', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.interrupted', sessionId: 's1', at: 11000 });
  assert.equal(registry.snapshot(ctx(12000)).elapsedSeconds, 10);
  assert.equal(registry.snapshot(ctx(11000 + 10001)).elapsedSeconds, 0);
});

test('token usage keeps the maximum cumulative value', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1100, input: 100, output: 50 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1200, input: 120, output: 60 });

  const state = registry.snapshot(ctx(1300));
  assert.equal(state.tokens?.input, 120);
  assert.equal(state.tokens?.output, 60);
  assert.equal(state.tokens?.total, 180);
});

test('cumulative session tokens never become a context percentage', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1100, input: 900000, output: 100000 });
  const state = registry.snapshot(ctx(1200));
  assert.equal(state.tokens?.total, 1000000);
  assert.equal(state.tokens?.contextPct, null);
});

test('tool calls are deduplicated', () => {
  const registry = liveRegistry();
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
  const registry = liveRegistry();
  registry.apply({ kind: 'session.started', sessionId: 's1', at: 1000 });
  const state = registry.snapshot(ctx(1100));
  assert.equal(state.tokens?.input, null);
  assert.equal(state.tokens?.output, null);
  assert.equal(state.tokens?.total, null);
});

test('opencode and mcp values are carried through', () => {
  const registry = liveRegistry();
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
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  const state = registry.snapshot({ ...ctx(1100), bridge: 'degraded' });
  assert.equal(state.status, 'offline');
});

test('elapsed time runs while the execution is active', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  assert.equal(registry.snapshot(ctx(11000)).elapsedSeconds, 10);
});

test('elapsed time freezes on the terminal duration, then reads zero', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 8000 });

  assert.equal(registry.snapshot(ctx(9000)).elapsedSeconds, 7);
  assert.equal(registry.snapshot(ctx(8000 + 4001)).elapsedSeconds, 0);
});

test('a phase seen without execution.started starts the chronometer', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'phase', sessionId: 's1', at: 5000, status: 'thinking' });

  const state = registry.snapshot(ctx(9000));
  assert.equal(state.status, 'thinking');
  assert.equal(state.elapsedSeconds, 4);
});

test('a new execution after idle restarts the chronometer', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });
  registry.apply({ kind: 'session.idle', sessionId: 's1', at: 2500 });
  assert.equal(registry.snapshot(ctx(3000)).elapsedSeconds, 0);

  registry.apply({ kind: 'phase', sessionId: 's1', at: 5000, status: 'thinking' });
  assert.equal(registry.snapshot(ctx(7000)).elapsedSeconds, 2);
});

test('a pending permission keeps priority over later phase and tool events', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'tool.started', sessionId: 's1', at: 1100, toolId: 't1', category: 'shell' });
  registry.apply({ kind: 'permission.asked', sessionId: 's1', at: 1200, requestId: 'p1' });
  registry.apply({ kind: 'permission.asked', sessionId: 's1', at: 1210, requestId: 'p1' });
  registry.apply({ kind: 'phase', sessionId: 's1', at: 1300, status: 'working' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 's1', at: 1400, toolId: 't1', category: 'shell' });

  let state = registry.snapshot(ctx(1500));
  assert.equal(state.status, 'permission_required');
  assert.equal(state.pendingPermissions, 1);

  registry.apply({ kind: 'permission.replied', sessionId: 's1', at: 1600, requestId: 'p1' });
  state = registry.snapshot(ctx(1700));
  assert.equal(state.pendingPermissions, 0);
  assert.equal(state.status, 'thinking');
});

test('a permission sync replaces the pending set instead of accumulating it', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'permission.sync', sessionId: 's1', at: 1100, requestIds: ['a', 'b'] });
  assert.equal(registry.snapshot(ctx(1200)).pendingPermissions, 2);

  registry.apply({ kind: 'permission.sync', sessionId: 's1', at: 1300, requestIds: ['b'] });
  assert.equal(registry.snapshot(ctx(1400)).pendingPermissions, 1);
});

test('tokens belong to the focus session, not to every session summed', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 'older', at: 1000 });
  registry.apply({ kind: 'usage', sessionId: 'older', at: 1100, input: 1000, output: 100 });
  registry.apply({ kind: 'execution.started', sessionId: 'current', at: 2000 });
  registry.apply({ kind: 'usage', sessionId: 'current', at: 2100, input: 10, output: 5 });

  const state = registry.snapshot(ctx(2200));
  assert.equal(state.tokens?.input, 10);
  assert.equal(state.tokens?.output, 5);
  assert.equal(state.tokens?.total, 15);
});

test('an unknown token counter stays null instead of zero', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'usage', sessionId: 's1', at: 1100, input: 10 });

  const state = registry.snapshot(ctx(1200));
  assert.equal(state.tokens?.input, 10);
  assert.equal(state.tokens?.output, null);
  assert.equal(state.tokens?.total, null);
});

test('tools belong to the focus session and survive a missing start', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 'older', at: 1000 });
  registry.apply({ kind: 'tool.started', sessionId: 'older', at: 1100, toolId: 'a', category: 'read' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 'older', at: 1200, toolId: 'a', category: 'read' });
  registry.apply({ kind: 'execution.started', sessionId: 'current', at: 2000 });
  // No start for this call: the outcome still counts, but running is untouched.
  registry.apply({ kind: 'tool.failed', sessionId: 'current', at: 2100, toolId: 'b', category: 'shell' });
  registry.apply({ kind: 'tool.failed', sessionId: 'current', at: 2110, toolId: 'b', category: 'shell' });

  const state = registry.snapshot(ctx(2200));
  assert.equal(state.tools?.running, 0);
  assert.equal(state.tools?.success, 0);
  assert.equal(state.tools?.failed, 1);
});

test('a duplicate outcome cannot decrement running twice', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'tool.started', sessionId: 's1', at: 1100, toolId: 't1', category: 'shell' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 's1', at: 1200, toolId: 't1', category: 'shell' });
  registry.apply({ kind: 'tool.succeeded', sessionId: 's1', at: 1300, toolId: 't1', category: 'shell' });
  registry.apply({ kind: 'tool.failed', sessionId: 's1', at: 1400, toolId: 't1', category: 'shell' });

  const state = registry.snapshot(ctx(1500));
  assert.equal(state.tools?.running, 0);
  assert.equal(state.tools?.success, 1);
  assert.equal(state.tools?.failed, 0);
});

test('reordered events older than a terminal state are ignored', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1000 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });
  registry.apply({ kind: 'phase', sessionId: 's1', at: 1900, status: 'working' });
  assert.equal(registry.snapshot(ctx(2100)).status, 'success');

  registry.apply({ kind: 'phase', sessionId: 's1', at: 2500, status: 'thinking' });
  assert.equal(registry.snapshot(ctx(2600)).status, 'thinking');
});

test('offline OpenCode clears MCP values but keeps a terminal notification', () => {
  const registry = liveRegistry();
  registry.apply({
    kind: 'mcp.status',
    at: 1000,
    online: 2,
    total: 3,
    servers: [{ alias: 'MCP-1', status: 'connected' }],
  });
  registry.apply({ kind: 'execution.started', sessionId: 's1', at: 1100 });
  registry.apply({ kind: 'execution.succeeded', sessionId: 's1', at: 2000 });
  registry.apply({ kind: 'opencode.offline', at: 2100 });

  const state = registry.snapshot(ctx(2200));
  assert.equal(state.status, 'success');
  assert.deepEqual(state.mcp, { online: 0, total: 0 });

  const expired = registry.snapshot(ctx(2000 + 4001));
  assert.equal(expired.status, 'offline');
});

test('the most recently active session wins at equal priority', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'execution.started', sessionId: 'first', at: 1000 });
  registry.apply({ kind: 'model', sessionId: 'first', at: 1100, model: 'model-a', agent: 'build' });
  registry.apply({ kind: 'execution.started', sessionId: 'second', at: 2000 });
  registry.apply({ kind: 'model', sessionId: 'second', at: 2100, model: 'model-b', agent: 'build' });

  const state = registry.snapshot(ctx(2200));
  assert.equal(state.model, 'model-b');
  assert.equal(state.elapsedSeconds, 0);
});


test('an inactive session is pruned after its TTL instead of growing the registry', () => {
  const registry = liveRegistry();
  registry.apply({ kind: 'session.started', sessionId: 'old', at: 1000 });
  registry.apply({ kind: 'model', sessionId: 'old', at: 1100, model: 'model-old', agent: 'build' });
  assert.equal(registry.snapshot(ctx(2000)).model, 'model-old');

  const expired = registry.snapshot(ctx(1100 + SESSION_TTL_MS + 1));
  assert.equal(expired.model, null);
  assert.equal(expired.activeSessions, 0);
});

test('the registry has a hard ceiling even when every session has a pending prompt', () => {
  const registry = liveRegistry();
  for (let i = 0; i < 300; ++i) {
    registry.apply({ kind: 'permission.asked', sessionId: `s${i}`, at: 1000 + i });
  }
  const state = registry.snapshot(ctx(2000));
  assert.ok(registry.list().length <= 256, `sessions=${registry.list().length}`);
  assert.ok((state.pendingPermissions ?? 0) <= 255, 'the snapshot counter stays bounded');
});
