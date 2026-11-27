// The plugin is dependency-free plain JavaScript. These tests exercise the
// Windows descriptor and the Unix token contract only; they do not create a real
// Windows named pipe. Platform-specific behaviour is AUTOMATED/MOCK, not NATIVE
// VERIFIED.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ipcPaths, readEndpoint } from './index.js';

test('the Unix plugin reads the socket and token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buddy-plugin-'));
  try {
    const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
    assert.equal(paths.platform, 'unix');
    await writeFile(paths.tokenFile, `${'a'.repeat(64)}\n`);
    assert.deepEqual(readEndpoint(paths), {
      address: join(dir, 'bridge.sock'),
      token: 'a'.repeat(64),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a missing Unix token means bridge unavailable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buddy-plugin-'));
  try {
    const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
    assert.equal(readEndpoint(paths), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the Windows plugin reads a valid descriptor and rejects malformed ones', async () => {
  const base = await mkdtemp(join(tmpdir(), 'buddy-plugin-win-'));
  const paths = ipcPaths({ LOCALAPPDATA: base }, 'win32');
  const token = 'b'.repeat(64);
  try {
    await mkdir(paths.dir, { recursive: true });
    await writeFile(
      paths.descriptorFile,
      `${JSON.stringify({
        v: 1,
        platform: 'win32',
        address: '\\\\.\\pipe\\opencode-buddy-0123456789abcdef',
        token,
      })}\n`,
    );
    assert.deepEqual(readEndpoint(paths), {
      address: '\\\\.\\pipe\\opencode-buddy-0123456789abcdef',
      token,
    });

    await writeFile(paths.descriptorFile, `${JSON.stringify({ v: 1, platform: 'win32', address: 'tcp://x', token })}\n`);
    assert.equal(readEndpoint(paths), null);

    await writeFile(paths.descriptorFile, `${JSON.stringify({ v: 1, platform: 'win32', address: '\\\\.\\pipe\\x', token: 'short' })}\n`);
    assert.equal(readEndpoint(paths), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
