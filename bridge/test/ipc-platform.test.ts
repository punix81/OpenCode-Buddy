import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

import { IpcServer } from '../src/ipc/server.js';
import { NullLogger } from '../src/logger.js';
import { ipcPaths } from '../src/ipc/paths.js';

test('Windows paths use a per-user directory and a derived named pipe', () => {
  const paths = ipcPaths({ LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local' }, 'win32');
  assert.equal(paths.dir, win32.join('C:\\Users\\alice\\AppData\\Local', 'opencode-buddy-ipc'));
  assert.match(paths.socket, /^\\\\\.\\pipe\\opencode-buddy-[0-9a-f]{16}$/);
});

test('Windows runtime overrides share a pipe regardless of path case', () => {
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: 'C:\\Buddy', LOCALAPPDATA: 'C:\\Local' }, 'win32');
  assert.equal(paths.dir, 'C:\\Buddy');
  assert.equal(paths.tokenFile, 'C:\\Buddy\\token');
  assert.equal(paths.socket, ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: 'c:\\buddy' }, 'win32').socket);
});

test('the Windows endpoint publishes and removes its descriptor and token', {
  skip: process.platform !== 'win32' && 'Requires the native Windows pipe host',
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'buddy-win-'));
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: join(parent, 'runtime') });
  const server = new IpcServer({
    paths, logger: new NullLogger(), onHello: () => undefined, onEvent: () => undefined,
    onHeartbeat: () => undefined, onDisconnect: () => undefined,
  });
  try {
    await server.start();
    const descriptor = JSON.parse(await readFile(paths.descriptorFile, 'utf8')) as Record<string, unknown>;
    assert.equal(descriptor['v'], 1);
    assert.equal(descriptor['platform'], 'win32');
    assert.equal(descriptor['address'], paths.socket);
    assert.equal(descriptor['token'], (await readFile(paths.tokenFile, 'utf8')).trim());
    await server.stop();
    await assert.rejects(readFile(paths.descriptorFile), { code: 'ENOENT' });
    await assert.rejects(readFile(paths.tokenFile), { code: 'ENOENT' });
  } finally {
    await server.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

test('a crashed Windows bridge releases its pipe and the next run rotates the token', {
  skip: process.platform !== 'win32' && 'Requires the native Windows pipe host',
  timeout: 10000,
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'buddy-crash-'));
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: join(parent, 'runtime') });
  const program = [
    "import { IpcServer } from './src/ipc/server.ts'",
    "import { ipcPaths } from './src/ipc/paths.ts'",
    "import { NullLogger } from './src/logger.ts'",
    "const ignore = () => undefined",
    "const server = new IpcServer({ paths: ipcPaths(), logger: new NullLogger(), onHello: ignore, onEvent: ignore, onHeartbeat: ignore, onDisconnect: ignore })",
    "await server.start()",
    "console.log('ready')",
  ].join(';\n');
  const run = () => spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
    env: { ...process.env, OPENCODE_BUDDY_RUNTIME_DIR: paths.dir }, windowsHide: true,
  });
  const start = async (child: ReturnType<typeof run>) => {
    const lines = createInterface({ input: child.stdout });
    try {
      for await (const line of lines) if (line === 'ready') return;
      assert.fail('bridge exited before publishing its descriptor');
    } finally {
      lines.close();
    }
  };
  const stop = async (child: ReturnType<typeof run>) => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  };
  let child = run();
  try {
    await start(child);
    const previous = await readFile(paths.tokenFile, 'utf8');
    await stop(child);
    child = run();
    await start(child);
    assert.notEqual(await readFile(paths.tokenFile, 'utf8'), previous);
  } finally {
    await stop(child);
    await rm(parent, { recursive: true, force: true });
  }
});
