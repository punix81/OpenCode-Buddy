import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { Bridge } from '../src/bridge.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { normalizeMcpStatus, parseIpcLine } from '../src/ipc/messages.js';
import { ipcPaths } from '../src/ipc/paths.js';
import { IpcServer } from '../src/ipc/server.js';
import { LiveSource } from '../src/live/source.js';
import { NullLogger } from '../src/logger.js';
import type { NormalizedEvent } from '../src/state/types.js';

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'buddy-ipc-'));
}

function connect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function closed(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
  });
}

function frame(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function hello(token: string): string {
  return frame({
    v: 1,
    type: 'hello',
    token,
    pid: 1234,
    app: 'cli',
    appVersion: '2.4.1',
    plugin: 'opencode-buddy',
    pluginVersion: '0.1.0',
  });
}

interface Harness {
  server: IpcServer;
  paths: ReturnType<typeof ipcPaths>;
  token: string;
  hellos: number[];
  events: Record<string, unknown>[];
  heartbeats: number[];
  disconnects: number[];
}

async function startServer(): Promise<Harness> {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const harness = {
    paths,
    token: '',
    hellos: [] as number[],
    events: [] as Record<string, unknown>[],
    heartbeats: [] as number[],
    disconnects: [] as number[],
  } as Harness;

  harness.server = new IpcServer({
    paths,
    logger: new NullLogger(),
    onHello: (peer) => harness.hellos.push(peer),
    onEvent: (peer, raw) => harness.events.push({ peer, ...raw }),
    onHeartbeat: (peer) => harness.heartbeats.push(peer),
    onDisconnect: (peer) => harness.disconnects.push(peer),
  });
  await harness.server.start();
  harness.token = (await readFile(paths.tokenFile, 'utf8')).trim();
  return harness;
}

test('ipc socket and token are private to the user', async () => {
  const harness = await startServer();
  try {
    const dirMode = (await stat(harness.paths.dir)).mode & 0o777;
    const socketMode = (await stat(harness.paths.socket)).mode & 0o777;
    const tokenMode = (await stat(harness.paths.tokenFile)).mode & 0o777;
    assert.equal(dirMode, 0o700);
    assert.equal(socketMode, 0o600);
    assert.equal(tokenMode, 0o600);
    assert.equal(harness.token.length, 64);
  } finally {
    await harness.server.stop();
  }
});

test('a connection without the token is rejected before any payload is read', async () => {
  const harness = await startServer();
  try {
    const bad = await connect(harness.paths.socket);
    bad.on('error', () => undefined);
    bad.write(hello('0'.repeat(64)));
    await closed(bad);
    assert.equal(harness.hellos.length, 0);

    const good = await connect(harness.paths.socket);
    good.on('error', () => undefined);
    good.write(hello(harness.token));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(harness.hellos.length, 1);
    good.destroy();
  } finally {
    await harness.server.stop();
  }
});

test('an event before hello closes the connection', async () => {
  const harness = await startServer();
  try {
    const socket = await connect(harness.paths.socket);
    socket.on('error', () => undefined);
    socket.write(frame({ v: 1, type: 'event', event: { kind: 'session.started', sessionId: 's', at: 1 } }));
    await closed(socket);
    assert.equal(harness.events.length, 0);
  } finally {
    await harness.server.stop();
  }
});

test('several authenticated peers coexist and are tracked independently', async () => {
  const harness = await startServer();
  try {
    const first = await connect(harness.paths.socket);
    const second = await connect(harness.paths.socket);
    for (const socket of [first, second]) socket.on('error', () => undefined);
    first.write(hello(harness.token));
    second.write(hello(harness.token));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(harness.hellos, [1, 2]);
    assert.equal(harness.server.connectionCount, 2);

    first.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(harness.disconnects, [1]);
    second.destroy();
  } finally {
    await harness.server.stop();
  }
});

test('parseIpcLine is default-deny', () => {
  assert.equal(parseIpcLine('{').ok, false);
  assert.equal(parseIpcLine(JSON.stringify({ v: 2, type: 'hello', token: 'x' })).ok, false);
  assert.equal(parseIpcLine(JSON.stringify({ v: 1, type: 'hello' })).ok, false);
  assert.equal(parseIpcLine(JSON.stringify({ v: 1, type: 'event', event: { kind: 1 } })).ok, false);
  assert.equal(parseIpcLine(JSON.stringify({ v: 1, type: 'unknown' })).ok, false);

  const ok = parseIpcLine(hello('a'.repeat(64)).trim());
  assert.equal(ok.ok, true);
  if (ok.ok && ok.message.type === 'hello') assert.equal(ok.message.hello.appVersion, '2.4.1');
});

test('mcp names are anonymised before they can reach the device', () => {
  const aliases = new Map<string, string>();
  const options = {
    allowRealMcpNames: false,
    aliasFor: (name: string) => {
      const existing = aliases.get(name);
      if (existing !== undefined) return existing;
      const alias = `MCP-${aliases.size + 1}`;
      aliases.set(name, alias);
      return alias;
    },
  };
  const normalized = normalizeMcpStatus(
    {
      kind: 'mcp.status',
      at: 10,
      servers: [
        { name: 'context7', status: 'connected' },
        { name: 'internal-roadmap', status: 'needs_auth' },
      ],
    },
    options,
  ) as NormalizedEvent & { servers: { alias: string }[] };

  assert.equal(normalized.kind, 'mcp.status');
  assert.deepEqual(
    normalized.servers.map((server) => server.alias),
    ['MCP-1', 'MCP-2'],
  );
  assert.ok(!JSON.stringify(normalized).includes('context7'));
});

test('live source aliases mcp names and closes sessions when the plugin leaves', async () => {
  const events: NormalizedEvent[] = [];
  const bridge = { ingest: (event: NormalizedEvent) => events.push(event) } as unknown as Bridge;
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const live = new LiveSource({ bridge, config: DEFAULT_CONFIG, logger: new NullLogger(), paths });

  await live.start();
  try {
    const token = (await readFile(paths.tokenFile, 'utf8')).trim();
    const socket = await connect(paths.socket);
    socket.on('error', () => undefined);
    socket.write(hello(token));
    socket.write(
      frame({
        v: 1,
        type: 'event',
        event: {
          kind: 'mcp.status',
          at: 5,
          servers: [{ name: 'private-server', status: 'connected' }],
        },
      }),
    );
    socket.write(
      frame({
        v: 1,
        type: 'event',
        event: { kind: 'session.started', sessionId: 'ses_1', at: 6 },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(live.status.connected, true);
    const mcp = events.find((event) => event.kind === 'mcp.status');
    assert.ok(mcp !== undefined);
    assert.ok(!JSON.stringify(mcp).includes('private-server'));
    assert.ok(events.some((event) => event.kind === 'session.started'));

    await live.stop();
    assert.ok(events.some((event) => event.kind === 'opencode.offline'));
    assert.ok(
      events.some((event) => event.kind === 'session.closed' && event.sessionId === 'ses_1'),
      'a stale session must be closed so its pending counters disappear',
    );
  } finally {
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
