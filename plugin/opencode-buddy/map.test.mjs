// Fixtures are synthetic: they follow the payload shapes published by the
// installed OpenCode 2.4.1 OpenAPI document, but they are not captures. Real
// captures are recorded separately in docs/evidence/phase-3-live-validation.md.
import assert from 'node:assert/strict';
import test from 'node:test';

import { categoryFor, createProjector, projectSessionSnapshot } from './map.js';

const S = 'ses_0f5c1a2b3c4d5e6f7a8b9c0d';

function ev(type, data) {
  return { id: 'evt_1', created: 1_700_000_000_000, type, data };
}

test('execution lifecycle is mapped one to one', () => {
  const p = createProjector();
  const kinds = ['started', 'succeeded', 'failed', 'interrupted'].map(
    (phase) => p.project(ev(`session.execution.${phase}`, { sessionID: S }))[0].kind,
  );
  assert.deepEqual(kinds, [
    'execution.started',
    'execution.succeeded',
    'execution.failed',
    'execution.interrupted',
  ]);
});

test('tool name from input.started drives the category and the counters', () => {
  const p = createProjector();
  assert.equal(p.project(ev('session.tool.input.started', { sessionID: S, assistantMessageID: 'msg_1', id: 'tool_1', name: 'bash' })).length, 0);
  const started = p.project(ev('session.tool.called', { sessionID: S, assistantMessageID: 'msg_1', id: 'tool_1', input: {}, executed: true }))[0];
  assert.equal(started.kind, 'tool.started');
  assert.equal(started.category, 'shell');
  assert.equal(started.toolId, 'tool_1');
  assert.equal(started.messageId, 'msg_1');

  const done = p.project(ev('session.tool.success', { sessionID: S, assistantMessageID: 'msg_1', id: 'tool_1', content: [], executed: true }))[0];
  assert.equal(done.kind, 'tool.succeeded');
  assert.equal(done.category, 'shell');
});

test('an unknown tool falls back to other, a namespaced one to mcp', () => {
  assert.equal(categoryFor('bash'), 'shell');
  assert.equal(categoryFor('read'), 'read');
  assert.equal(categoryFor('edit'), 'edit');
  assert.equal(categoryFor('grep'), 'search');
  assert.equal(categoryFor('context7_resolve-library-id'), 'mcp');
  assert.equal(categoryFor('mystery'), 'other');
  assert.equal(categoryFor(undefined), 'other');
});

test('permissions and forms use the session that owns them', () => {
  const p = createProjector();
  assert.deepEqual(p.project(ev('permission.asked', { id: 'perm_1', sessionID: S, action: 'edit', resources: ['a.ts'] }))[0], {
    kind: 'permission.asked',
    sessionId: S,
    at: 1_700_000_000_000,
    requestId: 'perm_1',
  });
  assert.equal(p.project(ev('permission.replied', { sessionID: S, requestID: 'perm_1', reply: 'once' }))[0].requestId, 'perm_1');
  assert.equal(p.project(ev('form.created', { form: { id: 'form_1', sessionID: S, title: 'Pick', fields: [] } }))[0].requestId, 'form_1');
  assert.equal(p.project(ev('form.replied', { id: 'form_1', sessionID: S, answer: {} }))[0].requestId, 'form_1');
  assert.equal(p.project(ev('form.cancelled', { id: 'form_1', sessionID: S }))[0].requestId, 'form_1');
});

test('usage keeps the cumulative counters including the cache split', () => {
  const p = createProjector();
  const usage = p.project(
    ev('session.usage.updated', {
      sessionID: S,
      cost: 0.01,
      tokens: { input: 120, output: 80, reasoning: 30, cache: { read: 10, write: 4 } },
    }),
  )[0];
  assert.deepEqual(usage, {
    kind: 'usage',
    sessionId: S,
    at: 1_700_000_000_000,
    input: 120,
    output: 80,
    reasoning: 30,
    cacheRead: 10,
    cacheWrite: 4,
  });
});

test('model and agent are carried from the step', () => {
  const p = createProjector();
  p.project(ev('session.created', { sessionID: S, agent: 'build', model: { providerID: 'bit-ai', id: 'deepseek-v4-1-flash-1017-r' } }));
  const model = p.project(ev('session.step.started', { sessionID: S, assistantMessageID: 'msg_1', agent: 'review', model: { providerID: 'p', id: 'm' }, started: 1 })).find(
    (event) => event.kind === 'model',
  );
  assert.equal(model.agent, 'review');
  assert.equal(model.model, 'm');
});

test('no prompt, response, tool argument or path can leave the projector', () => {
  const p = createProjector();
  const secrets = ['TOP_SECRET_PROMPT', 'SECRET_RESPONSE', '/home/user/private', 'rm -rf /'];
  const projected = [
    ...p.project(ev('session.created', { sessionID: S, title: secrets[0], agent: 'build' })),
    ...p.project(ev('session.text.delta', { sessionID: S, assistantMessageID: 'msg_1', ordinal: 0, delta: secrets[1] })),
    ...p.project(ev('session.tool.called', { sessionID: S, assistantMessageID: 'msg_1', id: 't1', input: { path: secrets[2], command: secrets[3] }, executed: true })),
    ...p.project(ev('session.tool.success', { sessionID: S, assistantMessageID: 'msg_1', id: 't1', content: [{ type: 'text', text: secrets[1] }], executed: true })),
  ];
  const wire = JSON.stringify(projected);
  for (const secret of secrets) {
    assert.ok(!wire.includes(secret), `leaked ${secret}`);
  }
});

test('mcp aggregate accepts an array of servers (defensive shape, not the runtime one)', () => {
  const p = createProjector();
  p.project(
    ev('mcp.status.changed', {
      server: [
        { name: 'context7', status: { status: 'connected' } },
        { name: 'jeap-mcp', status: { status: 'needs_auth' } },
      ],
    }),
  );
  const first = p.takeMcp();
  assert.deepEqual(first.servers, [
    { name: 'context7', status: 'connected' },
    { name: 'jeap-mcp', status: 'needs_auth' },
  ]);
  assert.equal(first.online, 1);
  assert.equal(first.total, 2);
});

test('an mcp name-only event never invents a status', () => {
  const p = createProjector();
  assert.deepEqual(p.project(ev('mcp.status.changed', { server: 'context7' })), []);
  assert.equal(p.takeMcp(), null, 'a name without a status must not reach the device');
});

test('mcp aggregate is produced once per change and stays bounded', () => {
  const p = createProjector();
  p.project(ev('mcp.status.changed', { server: { name: 'context7', status: 'connected' } }));
  p.project(ev('mcp.status.changed', { server: { name: 'docs', status: 'needs_auth' } }));
  const mcp = p.takeMcp();
  assert.equal(mcp.total, 2);
  assert.equal(mcp.online, 1);
  assert.equal(p.takeMcp(), null, 'a second call without a change must stay quiet');

  for (let i = 0; i < 40; ++i) {
    p.project(ev('mcp.status.changed', { server: { name: `server-${i}`, status: 'disabled' } }));
  }
  const bounded = p.takeMcp();
  assert.equal(bounded.total, 42, 'totals cover the complete list');
  assert.equal(bounded.servers.length, 16, 'details stay bounded');
});

test('an MCP snapshot replaces the list and removes vanished servers', () => {
  const p = createProjector();
  p.seedMcp([
    { name: 'a', status: { status: 'connected' } },
    { name: 'b', status: { status: 'disabled' } },
  ]);
  let mcp = p.takeMcp();
  assert.equal(mcp.total, 2);
  assert.equal(mcp.online, 1);

  p.seedMcp([{ name: 'a', status: { status: 'failed' } }]);
  mcp = p.takeMcp();
  assert.equal(mcp.total, 1);
  assert.equal(mcp.online, 0);
  assert.deepEqual(mcp.servers.map((entry) => entry.name), ['a']);
});

test('a reconnect snapshot restores model and usage but never a terminal state', () => {
  const events = projectSessionSnapshot({
    id: S,
    agent: 'build',
    model: { providerID: 'bit-ai', id: 'deepseek-v4-1-flash-1017-r' },
    tokens: { input: 5, output: 6, reasoning: 0, cache: { read: 0, write: 0 } },
    outcome: 'succeeded',
  });
  assert.deepEqual(
    events.map((event) => event.kind),
    ['session.started', 'model', 'usage'],
  );
  assert.ok(!events.some((event) => event.kind === 'execution.succeeded'));
});

test('a snapshot of a busy session restores the execution start from time.busy', () => {
  const busyAt = Date.now() - 90_000;
  const events = projectSessionSnapshot({ id: S, time: { busy: busyAt, idle: busyAt - 60_000 } });
  const start = events.find((event) => event.kind === 'execution.started');
  assert.equal(start?.at, busyAt);

  const firstRun = projectSessionSnapshot({ id: S, time: { busy: busyAt } });
  assert.equal(firstRun.find((event) => event.kind === 'execution.started')?.at, busyAt);
});

test('a snapshot of an idle session invents no execution start', () => {
  const now = Date.now();
  const events = projectSessionSnapshot({ id: S, time: { busy: now - 60_000, idle: now - 30_000 } });
  assert.ok(!events.some((event) => event.kind === 'execution.started'));
});
