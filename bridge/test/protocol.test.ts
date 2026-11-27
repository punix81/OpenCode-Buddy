import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LineFramer, SequenceTracker, negotiateMajor } from '../src/protocol/codec.js';
import { validateLine, validateMessage } from '../src/protocol/validator.js';

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as T;
}

interface Vectors {
  valid: { name: string; message: unknown }[];
  invalid: { name: string; message?: unknown; line?: string; error: string }[];
}

const vectors = loadJson<Vectors>('../../protocol/test-vectors/messages.json');
const boundaries = loadJson<{
  cases: { name: string; length: number; valid: boolean }[];
  fragmentation: { name: string; chunks: string[]; messages: number }[];
}>('../../protocol/test-vectors/boundaries.json');
const sequences = loadJson<{ cases: { name: string; last: number; incoming: number; action: string }[] }>(
  '../../protocol/test-vectors/sequence.json',
);

test('valid vectors pass validation', () => {
  for (const item of vectors.valid) {
    const result = validateMessage(item.message);
    assert.equal(result.ok, true, `${item.name}: ${result.ok ? '' : result.code}`);
  }
});

test('invalid vectors fail with the expected code', () => {
  for (const item of vectors.invalid) {
    const result = item.line !== undefined ? validateLine(item.line) : validateMessage(item.message);
    assert.equal(result.ok, false, `${item.name} should fail`);
    if (!result.ok) {
      assert.equal(result.code, item.error, item.name);
    }
  }
});

test('sequence tracker follows the normative cases', () => {
  for (const item of sequences.cases) {
    const tracker = new SequenceTracker();
    if (item.last > 0) {
      tracker.accept(1);
      for (let seq = 2; seq <= item.last; ++seq) tracker.accept(seq);
    }
    if (item.action === 'new_session') {
      tracker.reset();
      assert.equal(tracker.accept(item.incoming), 'apply', item.name);
      continue;
    }
    const action = tracker.accept(item.incoming);
    assert.equal(action, item.action, item.name);
  }
});

test('framer handles fragmentation, concatenation and CRLF', () => {
  for (const item of boundaries.fragmentation) {
    const framer = new LineFramer();
    let messages = 0;
    for (const chunk of item.chunks) {
      messages += framer.push(chunk).lines.length;
    }
    assert.equal(messages, item.messages, item.name);
  }
});

test('line boundary includes the newline', () => {
  const base = '{"v":1,"type":"heartbeat","seq":1}';
  for (const item of boundaries.cases) {
    const line = base + ' '.repeat(Math.max(0, item.length - base.length));
    assert.equal(Buffer.byteLength(line), item.length);
    const result = validateLine(line);
    assert.equal(result.ok, item.valid, `${item.name} length=${item.length}`);
  }
});

test('framer discards an oversized line and recovers', () => {
  const framer = new LineFramer();
  const oversized = `${'x'.repeat(3000)}\n`;
  const first = framer.push(oversized);
  assert.equal(first.lines.length, 0);
  assert.equal(first.overflows, 1);
  const second = framer.push('{"v":1,"type":"heartbeat","seq":1}\n');
  assert.equal(second.lines.length, 1);
  // The overflow belongs to the chunk that caused it; a later chunk must not
  // report it again (the bridge used to send E_TOO_LONG on every chunk).
  assert.equal(second.overflows, 0);
});

test('version negotiation requires a common major', () => {
  assert.equal(negotiateMajor([1]), 1);
  assert.equal(negotiateMajor([2]), null);
  assert.equal(negotiateMajor([2, 1]), 1);
});

test('heartbeat must not carry data', () => {
  const result = validateMessage({ v: 1, type: 'heartbeat', seq: 1, data: {} });
  assert.equal(result.ok, false);
});
