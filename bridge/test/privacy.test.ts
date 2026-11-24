import assert from 'node:assert/strict';
import test from 'node:test';

import { PrivacyFilter } from '../src/privacy/privacy.js';
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

test('missing bridge version is rendered as unavailable', () => {
  const input = baseState();
  input.versions = { bridge: '', protocol: 1 };
  const output = new PrivacyFilter().projectState(input);
  assert.equal(output.versions.bridge, '--');
});
