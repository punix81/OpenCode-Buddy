import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyWindowsAcl, createIpcEndpoint, windowsAclArgs } from '../src/ipc/endpoint.js';
import { NullLogger } from '../src/logger.js';
import { ipcPaths } from '../src/ipc/paths.js';

// Windows behaviour is simulated on Linux for source-level confidence only.
// This is AUTOMATED/MOCK, not NATIVE VERIFIED: no Windows pipe, DACL or COM port
// was exercised.

test('Windows paths use a per-user directory and a derived named pipe', () => {
  const paths = ipcPaths(
    { LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local' },
    'win32',
  );
  assert.equal(paths.platform, 'win32');
  assert.equal(paths.dir, join('C:\\Users\\alice\\AppData\\Local', 'opencode-buddy'));
  assert.match(paths.socket, /^\\\\\.\\pipe\\opencode-buddy-[0-9a-f]{16}$/);
  assert.equal(paths.tokenFile, join(paths.dir, 'token'));
  assert.equal(paths.descriptorFile, join(paths.dir, 'bridge.json'));
  assert.equal(paths.lockFile, join(paths.dir, 'bridge.lock'));
});

test('the runtime override wins on Windows and is used verbatim', () => {
  const paths = ipcPaths(
    { OPENCODE_BUDDY_RUNTIME_DIR: 'C:\\Buddy', LOCALAPPDATA: 'C:\\Local' },
    'win32',
  );
  assert.equal(paths.dir, 'C:\\Buddy');
  assert.equal(paths.tokenFile, join('C:\\Buddy', 'token'));
});

test('the Windows endpoint writes and removes the descriptor and token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buddy-win-'));
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir }, 'win32');
  const endpoint = createIpcEndpoint(paths, new NullLogger());
  try {
    endpoint.ensureDirectory();
    endpoint.prepare('a'.repeat(64));
    const descriptor = JSON.parse(await readFile(paths.descriptorFile, 'utf8')) as {
      v: number;
      platform: string;
      address: string;
      token: string;
    };
    assert.equal(descriptor.v, 1);
    assert.equal(descriptor.platform, 'win32');
    assert.equal(descriptor.address, paths.socket);
    assert.equal(descriptor.token, 'a'.repeat(64));
    assert.equal((await stat(paths.tokenFile)).mode & 0o777, 0o600);
  } finally {
    endpoint.cleanup();
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(paths.descriptorFile.endsWith('bridge.json'), true);
});

test('the ACL helper builds the restrictive icacls command', () => {
  assert.deepEqual(windowsAclArgs('C:\\Buddy\\token', 'alice'), [
    'C:\\Buddy\\token',
    '/inheritance:r',
    '/grant:r',
    'alice:F',
  ]);
  const calls: string[][] = [];
  const ok = applyWindowsAcl('C:\\Buddy\\token', 'alice', {
    platform: 'win32',
    run: (_command, args) => calls.push(args),
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);

  const failed = applyWindowsAcl('C:\\Buddy\\token', 'alice', {
    platform: 'win32',
    run: () => {
      throw new Error('icacls unavailable');
    },
  });
  assert.equal(failed, false);
  assert.equal(applyWindowsAcl('x', 'alice', { platform: 'linux' }), false);
});
