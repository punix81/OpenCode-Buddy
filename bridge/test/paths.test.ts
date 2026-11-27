import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ipcPaths } from '../src/ipc/paths.js';

test('the runtime directory can be overridden explicitly', () => {
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: '/run/user/1000/buddy' });
  assert.equal(paths.dir, '/run/user/1000/buddy');
  assert.equal(paths.socket, '/run/user/1000/buddy/bridge.sock');
  assert.equal(paths.tokenFile, '/run/user/1000/buddy/token');
  assert.equal(paths.lockFile, '/run/user/1000/buddy/bridge.lock');
});

test('XDG_RUNTIME_DIR is used when no override is set', () => {
  const paths = ipcPaths({ XDG_RUNTIME_DIR: '/run/user/1000' });
  assert.equal(paths.dir, join('/run/user/1000', 'opencode-buddy'));
  assert.equal(paths.socket, join('/run/user/1000', 'opencode-buddy', 'bridge.sock'));
});

test('without a runtime directory the uid keeps users apart', () => {
  const paths = ipcPaths({});
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  assert.equal(paths.dir, join(tmpdir(), `opencode-buddy-${uid}`));
  assert.ok(paths.socket.startsWith(paths.dir));
});

test('the override wins over XDG_RUNTIME_DIR', () => {
  const paths = ipcPaths({
    OPENCODE_BUDDY_RUNTIME_DIR: '/tmp/buddy-override',
    XDG_RUNTIME_DIR: '/run/user/1000',
  });
  assert.equal(paths.dir, '/tmp/buddy-override');
});
