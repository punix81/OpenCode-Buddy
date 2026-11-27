import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { LineFramer, encodeMessage } from '../src/protocol/codec.js';
import { ERROR_CODES, MAX_LINE_BYTES } from '../src/protocol/types.js';
import { validateLine } from '../src/protocol/validator.js';

// Deterministic, offline fuzz corpus for the NDJSON validator and framer.
// Every case is generated from a fixed seed, so a failure is reproducible by
// running the suite again. No network, no real device, bounded runtime.

const SEED = 0xb0dd1e5;
const CASES = 10_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

const VECTORS = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../protocol/test-vectors/messages.json'), 'utf8'),
) as { valid: { message: unknown }[] };

const VALID_LINES = VECTORS.valid.map((item) => JSON.stringify(item.message));

const ALPHABET = '{}[]",:0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ \t\n\r\\/.-_';
const BOUNDARIES = [0, 1, 2, 63, 64, 127, 128, 255, 256, 1023, 1024, 2047, 2048, 3000];

function randomText(maxLength: number): string {
  let out = '';
  const length = Math.floor(random() * maxLength);
  for (let i = 0; i < length; ++i) {
    out += pick(ALPHABET.split(''));
  }
  return out;
}

function mutate(base: string): string {
  const operation = Math.floor(random() * 6);
  switch (operation) {
    case 0: {
      const index = Math.floor(random() * (base.length + 1));
      return base.slice(0, index) + randomText(8) + base.slice(index);
    }
    case 1: {
      const index = Math.floor(random() * base.length);
      return base.slice(0, index) + base.slice(index + 1);
    }
    case 2: {
      const index = Math.floor(random() * base.length);
      return base.slice(0, index) + pick(ALPHABET.split('')) + base.slice(index + 1);
    }
    case 3: {
      const index = Math.floor(random() * base.length);
      return base.slice(0, index);
    }
    case 4:
      return base + base;
    default: {
      const index = Math.floor(random() * Math.min(base.length, 40));
      return base.slice(0, index) + '"'.repeat(1 + Math.floor(random() * 3)) + base.slice(index);
    }
  }
}

test('the validator survives 10 000 deterministic malformed inputs', () => {
  const codes = new Set<string>(ERROR_CODES);
  for (let i = 0; i < CASES; ++i) {
    let line: string;
    const kind = i % 4;
    if (kind === 0) {
      line = randomText(3000);
    } else if (kind === 1) {
      line = mutate(pick(VALID_LINES));
    } else if (kind === 2) {
      line = `${' '.repeat(i % 8)}${mutate(pick(VALID_LINES))}`;
    } else {
      const boundary = pick(BOUNDARIES);
      line = pick(VALID_LINES).slice(0, boundary);
    }

    const result = validateLine(line);
    if (result.ok) {
      assert.ok(result.message.seq >= 1, `accepted seq at case ${i}`);
      assert.ok(result.message.v === 1, `accepted version at case ${i}`);
      const encoded = encodeMessage(result.message);
      assert.ok(
        Buffer.byteLength(encoded, 'utf8') + 1 <= MAX_LINE_BYTES,
        `accepted message fits the line at case ${i}`,
      );
    } else {
      assert.ok(codes.has(result.code), `known error code at case ${i}: ${result.code}`);
      assert.ok(result.detail.length > 0, `detail at case ${i}`);
    }
  }
});

test('the framer reassembles arbitrary chunkings without inventing frames', () => {
  const frames = [
    JSON.stringify({ v: 1, type: 'ready', seq: 1, data: { bridge: '0.2.0', proto: 1, run: 'abcd1234' } }),
    JSON.stringify({ v: 1, type: 'config', seq: 2, data: { autoReturnSeconds: 60, gestures: { debounceMs: 35, doublePressWindowMs: 350, longPressMs: 1500, veryLongPressMs: 5000 }, source: 'live' } }),
    JSON.stringify({ v: 1, type: 'heartbeat', seq: 3 }),
  ];
  for (let iteration = 0; iteration < 400; ++iteration) {
    const input = Buffer.from(frames.map((frame) => `${frame}\n`).join(''), 'utf8');
    const framer = new LineFramer();
    const lines: string[] = [];
    let offset = 0;
    while (offset < input.length) {
      const size = 1 + Math.floor(random() * 5);
      lines.push(...framer.push(input.subarray(offset, offset + size)).lines);
      offset += size;
    }
    assert.deepEqual(lines, frames, `chunking ${iteration}`);
  }
});

test('an oversized chunk is reported once and the next chunk is clean', () => {
  const framer = new LineFramer();
  assert.equal(framer.push(`${'x'.repeat(4096)}\n`).overflows, 1);
  const next = framer.push('{"v":1,"type":"heartbeat","seq":1}\n');
  assert.equal(next.lines.length, 1);
  assert.equal(next.overflows, 0);
});

test('the bridge accepts exactly one complete JSON object per line', () => {
  const ready = JSON.stringify({ v: 1, type: 'ready', seq: 1, data: { bridge: '0.2.0', proto: 1, run: 'abcd1234' } });
  for (const prefix of ['BUDDY-PROBE ms=1', 'mpty=0 partial=0,"dto":', '{"v":1,"type":"hello","seq":1,']) {
    // Framing recovery belongs to the firmware parser; the bridge must stay
    // strict and never accept a line that is not exactly one object.
    assert.equal(validateLine(`${prefix}${ready}`).ok, false, `prefix ${prefix}`);
  }
  assert.equal(validateLine(ready).ok, true);
  assert.equal(validateLine(`${ready}{"v":1,"type":"heartbeat","seq":2}`).ok, false);
});
