import assert from 'node:assert/strict';
import test from 'node:test';

import { PrivacyFilter } from '../src/privacy/privacy.js';
import { normalizeEvent } from '../src/normalize/normalizer.js';
import type { StateData } from '../src/protocol/types.js';

function baseState(): StateData {
  return {
    status: 'working',
    model: 'mock-model',
    agent: 'build',
    activeSessions: 1,
    elapsedSeconds: 10,
    pendingPermissions: 0,
    pendingQuestions: 0,
    notifications: 0,
    retryAttempt: 0,
    tokens: { input: 10, output: 5, total: 15, contextPct: null },
    tools: {
      success: 1,
      failed: 0,
      running: 0,
      categories: { read: 1, edit: 0, shell: 0, search: 0, mcp: 0, other: 0 },
    },
    connection: { bridge: 'ready', opencode: 'connected' },
    versions: { bridge: '0.2.0', protocol: 1 },
    source: 'mock',
  };
}

test('unknown upstream fields never reach the projection', () => {
  const input = {
    ...baseState(),
    prompt: 'secret prompt',
    response: 'secret response',
    toolArguments: { path: '/etc/passwd' },
  } as unknown as StateData;

  const output = new PrivacyFilter().projectState(input) as unknown as Record<string, unknown>;
  assert.equal('prompt' in output, false);
  assert.equal('response' in output, false);
  assert.equal('toolArguments' in output, false);
});

test('URLs and control characters are removed from display strings', () => {
  const input = baseState();
  input.model = 'https://internal.example/model\u0000';
  input.agent = 'bu\u0007ild';
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.model, '[redacted]');
  assert.equal(output.agent, 'bu ild');
});

test('out-of-range numbers are clamped', () => {
  const input = baseState();
  input.activeSessions = 999999;
  input.notifications = 999;
  input.tools = { success: -5, failed: 0, running: 999, categories: { read: -1, edit: 0, shell: 0, search: 0, mcp: 0, other: 0 } };
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.activeSessions, 65535);
  assert.equal(output.notifications, 99);
  assert.equal(output.tools?.success, 0);
  assert.equal(output.tools?.running, 255);
  assert.equal(output.tools?.categories?.read, 0);
});

test('an invalid diagnostic code is dropped', () => {
  const input = baseState();
  input.diagnostic = { code: 'NOT_A_CODE' } as unknown as NonNullable<StateData['diagnostic']>;
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.diagnostic, undefined);
});

test('inconsistent MCP totals are rejected by the generic normalizer', () => {
  const inconsistent = normalizeEvent({
    kind: 'mcp.status',
    at: 1,
    online: 5,
    total: 2,
    servers: [{ alias: 'MCP-1', status: 'connected' }],
  });
  assert.equal(inconsistent, null, 'online cannot exceed total');
  const detailOverflow = normalizeEvent({
    kind: 'mcp.status',
    at: 1,
    online: 1,
    total: 1,
    servers: [
      { alias: 'MCP-1', status: 'connected' },
      { alias: 'MCP-2', status: 'pending' },
    ],
  });
  assert.equal(detailOverflow, null, 'details cannot exceed total');
  const valid = normalizeEvent({
    kind: 'mcp.status',
    at: 1,
    online: 1,
    total: 3,
    servers: [{ alias: 'MCP-1', status: 'connected' }],
  });
  assert.ok(valid !== null && valid.kind === 'mcp.status');
});

test('an individual token counter wider than uint32 is unknown, not clamped or dropped', () => {
  const wideInput = normalizeEvent({
    kind: 'usage',
    sessionId: 's1',
    at: 1,
    input: 0x100000000,
    output: 5,
    total: 0x100000005,
  });
  assert.ok(wideInput !== null && wideInput.kind === 'usage');
  assert.equal(wideInput?.kind === 'usage' ? wideInput.input : undefined, 0x100000000);

  const input = baseState();
  input.tokens = { input: 0x100000000, output: 5, total: 0x100000005, contextPct: null };
  const inputProjection = new PrivacyFilter().projectState(input);
  assert.equal(inputProjection.tokens?.input, null);
  assert.equal(inputProjection.tokens?.output, 5);
  assert.equal(inputProjection.tokens?.total, undefined);

  input.tokens = { input: 5, output: 0x100000000, total: 0x100000005, contextPct: null };
  const outputProjection = new PrivacyFilter().projectState(input);
  assert.equal(outputProjection.tokens?.input, 5);
  assert.equal(outputProjection.tokens?.output, null);
  assert.equal(outputProjection.tokens?.total, undefined);

  // Representable operands with a wide sum: both are kept, total is derived.
  input.tokens = { input: 0xffffffff, output: 10, total: 0x100000009, contextPct: null };
  const sumProjection = new PrivacyFilter().projectState(input);
  assert.equal(sumProjection.tokens?.input, 0xffffffff);
  assert.equal(sumProjection.tokens?.output, 10);
  assert.equal(sumProjection.tokens?.total, undefined);
});

test('counters at the JavaScript safe-integer limit never wrap', () => {
  const atLimit = normalizeEvent({
    kind: 'usage',
    sessionId: 's1',
    at: 1,
    input: Number.MAX_SAFE_INTEGER,
    output: Number.MAX_SAFE_INTEGER,
    total: Number.MAX_SAFE_INTEGER,
  });
  assert.ok(atLimit !== null && atLimit.kind === 'usage');
  assert.equal(atLimit?.kind === 'usage' ? atLimit.input : undefined, Number.MAX_SAFE_INTEGER);

  const state = baseState();
  state.tokens = {
    input: Number.MAX_SAFE_INTEGER,
    output: 5,
    total: Number.MAX_SAFE_INTEGER,
    contextPct: null,
  };
  const projected = new PrivacyFilter().projectState(state);
  assert.equal(projected.tokens?.input, null, 'above uint32 is unknown, not truncated');
  assert.equal(projected.tokens?.output, 5);
  assert.equal(projected.tokens?.total, undefined);

  for (const value of [Number.MAX_SAFE_INTEGER + 1, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.equal(
      normalizeEvent({ kind: 'usage', sessionId: 's1', at: 1, input: value }),
      null,
      `input=${String(value)} must be rejected, never wrapped or clamped`,
    );
  }
});

test('a total wider than uint32 is omitted so the device derives it', () => {
  const input = baseState();
  input.tokens = { input: 0xffffffff, output: 0xffffffff, total: 0x1fffffffe, contextPct: null };
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.tokens?.input, 0xffffffff);
  assert.equal(output.tokens?.output, 0xffffffff);
  assert.equal(output.tokens?.total, undefined);
});

test('missing bridge version is rendered as unavailable', () => {
  const input = baseState();
  input.versions = { bridge: '', protocol: 1 };
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.versions.bridge, '--');
});

test('display strings are bounded in UTF-8 bytes and stay Latin-1', () => {
  const filter = new PrivacyFilter();
  const emoji = filter.projectState({ ...baseState(), model: '😀'.repeat(40) });
  assert.equal(emoji.model, null, 'a non-Latin-1 model is unknown, not a broken frame');
  const accented = filter.projectState({ ...baseState(), model: 'é'.repeat(25) });
  assert.equal(accented.model, 'é'.repeat(20), '40 bytes of Latin-1, not 40 characters');
  const fits = filter.projectState({ ...baseState(), model: 'é'.repeat(20) });
  assert.equal(fits.model, 'é'.repeat(20));
  const agent = filter.projectState({ ...baseState(), agent: 'a'.repeat(30) });
  assert.equal(agent.agent, 'a'.repeat(24));
  const mcp = filter.projectMcp({
    online: 1,
    total: 1,
    source: 'live',
    servers: [{ alias: 'é'.repeat(7), status: 'connected' }],
  });
  assert.equal(mcp.servers[0]?.alias, 'é'.repeat(6), '12 bytes of alias');
});
