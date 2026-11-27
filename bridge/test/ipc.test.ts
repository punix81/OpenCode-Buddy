import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { Bridge } from '../src/bridge.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { normalizeMcpStatus, parseIpcLine } from '../src/ipc/messages.js';
import { ipcPaths } from '../src/ipc/paths.js';
import { IpcServer } from '../src/ipc/server.js';
import { assertNoOtherBridge } from '../src/ipc/lock.js';
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

function hello(token: string, appVersion = '2.4.1'): string {
  return frame({
    v: 1,
    type: 'hello',
    token,
    pid: 1234,
    app: 'cli',
    appVersion,
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
  sources: string[];
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
    sources: [] as string[],
  } as Harness;

  harness.server = new IpcServer({
    paths,
    logger: new NullLogger(),
    onHello: (peer) => harness.hellos.push(peer),
    onEvent: (peer, raw) => harness.events.push({ peer, ...raw }),
    onHeartbeat: (peer) => harness.heartbeats.push(peer),
    onSource: (_peer, status) => harness.sources.push(status),
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
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
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

test('a second bridge cannot steal the socket or the token', async () => {
  const harness = await startServer();
  const second = new IpcServer({
    paths: harness.paths,
    logger: new NullLogger(),
    onHello: () => undefined,
    onEvent: () => undefined,
    onHeartbeat: () => undefined,
    onDisconnect: () => undefined,
  });
  try {
    await assert.rejects(() => second.start(), /another bridge is running/);
    // The failed instance must not remove the live endpoint.
    await second.stop();
    const socket = await connect(harness.paths.socket);
    socket.destroy();
  } finally {
    await second.stop();
    await harness.server.stop();
  }
});

test('a stale lock from a dead process is recovered', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  await writeFile(paths.lockFile, '999999\n', { mode: 0o600 });
  const server = new IpcServer({
    paths,
    logger: new NullLogger(),
    onHello: () => undefined,
    onEvent: () => undefined,
    onHeartbeat: () => undefined,
    onDisconnect: () => undefined,
  });
  await server.start();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

test('a non-socket path is never unlinked to make room', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  await writeFile(paths.socket, 'do not delete me');
  const server = new IpcServer({
    paths,
    logger: new NullLogger(),
    onHello: () => undefined,
    onEvent: () => undefined,
    onHeartbeat: () => undefined,
    onDisconnect: () => undefined,
  });
  await assert.rejects(() => server.start(), /non-socket/);
  assert.equal(await readFile(paths.socket, 'utf8'), 'do not delete me');
  await rm(dir, { recursive: true, force: true });
});

test('the IPC line limit is measured in UTF-8 bytes', async () => {
  const harness = await startServer();
  try {
    const socket = await connect(harness.paths.socket);
    socket.write(hello(harness.token));
    // 5000 two-byte characters: 5000 JS code units but 10 000 UTF-8 bytes.
    const oversized = frame({
      v: 1,
      type: 'event',
      event: { kind: 'usage', sessionId: 's', at: 1, input: 1, pad: 'é'.repeat(5000) },
    });
    socket.write(oversized);
    await closed(socket);
    assert.equal(harness.events.length, 0);
  } finally {
    await harness.server.stop();
  }
});

test('MCP declared totals survive while details stay bounded', () => {
  const servers = Array.from({ length: 12 }, (_, index) => ({
    name: `server-${index}`,
    status: index < 7 ? 'connected' : 'disabled',
  }));
  const result = normalizeMcpStatus(
    { at: 1, online: 7, total: 12, servers },
    { allowRealMcpNames: false, aliasFor: (name) => name },
  ) as { online: number; total: number; servers: unknown[] };
  assert.equal(result.online, 7);
  assert.equal(result.total, 12);
  assert.equal(result.servers.length, 8);

  const contradictory = normalizeMcpStatus(
    { at: 1, online: 1, total: 1, servers },
    { allowRealMcpNames: false, aliasFor: (name) => name },
  );
  assert.equal(contradictory, null);
});

test('a source message reports the event-source health', async () => {
  const harness = await startServer();
  try {
    const socket = await connect(harness.paths.socket);
    socket.write(hello(harness.token));
    socket.write(frame({ v: 1, type: 'source', status: 'degraded', at: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(harness.sources, ['degraded']);
    socket.destroy();
  } finally {
    await harness.server.stop();
  }
});

test('one peer disconnecting closes only its own sessions', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const first = await connect(paths.socket);
  const second = await connect(paths.socket);
  try {
    first.write(hello(token));
    second.write(hello(token));
    first.write(frame({ v: 1, type: 'event', event: { kind: 'usage', sessionId: 'ses_a', at: 1, input: 1 } }));
    second.write(frame({ v: 1, type: 'event', event: { kind: 'usage', sessionId: 'ses_b', at: 2, input: 1 } }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    first.destroy();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const closedSessions = events.filter((event) => event.kind === 'session.closed');
    assert.deepEqual(closedSessions.map((event) => (event as { sessionId: string }).sessionId), ['ses_a']);
  } finally {
    first.destroy();
    second.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a finished session is evicted before a running one at the per-peer cap', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const peer = await connect(paths.socket);
  try {
    peer.write(hello(token));
    // ses_0 is finished; ses_1..ses_63 stay running. The 65th session must
    // evict the finished one, never a running focus.
    peer.write(frame({ v: 1, type: 'event', event: { kind: 'execution.succeeded', sessionId: 'ses_0', at: 1 } }));
    for (let i = 1; i < 64; ++i) {
      peer.write(frame({ v: 1, type: 'event', event: { kind: 'usage', sessionId: `ses_${i}`, at: 2, input: 1 } }));
    }
    peer.write(frame({ v: 1, type: 'event', event: { kind: 'usage', sessionId: 'ses_64', at: 3, input: 1 } }));
    await new Promise((resolve) => setTimeout(resolve, 120));

    const closedSessions = events
      .filter((event) => event.kind === 'session.closed')
      .map((event) => (event as { sessionId: string }).sessionId);
    assert.deepEqual(closedSessions, ['ses_0']);
  } finally {
    peer.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a future plugin timestamp is clamped before it can freeze a session', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const peer = await connect(paths.socket);
  try {
    peer.write(hello(token));
    const before = Date.now();
    peer.write(frame({
      v: 1,
      type: 'event',
      event: { kind: 'usage', sessionId: 'ses_future', at: before + 86_400_000, input: 1 },
    }));
    // A legitimate past timestamp (snapshot of a long execution) must survive.
    peer.write(frame({
      v: 1,
      type: 'event',
      event: { kind: 'execution.started', sessionId: 'ses_past', at: before - 3_600_000 },
    }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const future = events.find((event) => 'sessionId' in event && event.sessionId === 'ses_future');
    const past = events.find((event) => 'sessionId' in event && event.sessionId === 'ses_past');
    assert.ok(future !== undefined && past !== undefined);
    assert.ok((future as { at: number }).at <= Date.now(), 'future timestamp clamped');
    assert.ok((future as { at: number }).at >= before - 1000, 'clamped to now, not dropped');
    assert.equal((past as { at: number }).at, before - 3_600_000, 'past timestamp preserved');
  } finally {
    peer.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a degraded source invalidates its sessions and reports OpenCode offline', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const peer = await connect(paths.socket);
  try {
    peer.write(hello(token));
    peer.write(frame({ v: 1, type: 'event', event: { kind: 'usage', sessionId: 'ses_x', at: 1, input: 1 } }));
    peer.write(frame({ v: 1, type: 'source', status: 'degraded', at: 2 }));
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.ok(events.some((event) => event.kind === 'opencode.offline'));
    assert.ok(events.some((event) => event.kind === 'session.closed'));
  } finally {
    peer.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});


test('multiple peers with different versions leave the version unknown', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const versions: (string | null)[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: (version: string | null) => versions.push(version),
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const first = await connect(paths.socket);
  const second = await connect(paths.socket);
  try {
    first.write(hello(token, '2.4.1'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(versions.at(-1), '2.4.1');

    second.write(hello(token, '2.5.0'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(versions.at(-1), null, 'disagreeing peers are not presented as one version');

    second.destroy();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(versions.at(-1), '2.4.1', 'the remaining peer wins again');
  } finally {
    first.destroy();
    second.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a terminal notification survives the peer that produced it', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  const events: NormalizedEvent[] = [];
  const bridge = {
    ingest: (event: NormalizedEvent) => events.push(event),
    setOpenCodeVersion: () => undefined,
  } as unknown as Bridge;
  const live = new LiveSource({
    bridge,
    config: { ...DEFAULT_CONFIG, source: 'live' },
    logger: new NullLogger(),
    paths,
  });
  await live.start();
  const token = (await readFile(paths.tokenFile, 'utf8')).trim();
  const peer = await connect(paths.socket);
  try {
    peer.write(hello(token));
    peer.write(frame({ v: 1, type: 'event', event: { kind: 'execution.started', sessionId: 'ses_done', at: 1 } }));
    peer.write(frame({ v: 1, type: 'event', event: { kind: 'execution.succeeded', sessionId: 'ses_done', at: 2 } }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    peer.destroy();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const closedSessions = events
      .filter((event) => event.kind === 'session.closed')
      .map((event) => (event as { sessionId: string }).sessionId);
    assert.ok(!closedSessions.includes('ses_done'));
    assert.ok(events.some((event) => event.kind === 'opencode.offline'));
  } finally {
    peer.destroy();
    await live.stop();
    await rm(dir, { recursive: true, force: true });
  }
});


test('the preflight lock check refuses a live owner but allows a stale one', async () => {
  const dir = await tempDir();
  const paths = ipcPaths({ OPENCODE_BUDDY_RUNTIME_DIR: dir });
  try {
    await writeFile(paths.lockFile, `${process.pid}\n`, { mode: 0o600 });
    assert.doesNotThrow(() => assertNoOtherBridge(paths));

    await writeFile(paths.lockFile, '1\n', { mode: 0o600 });
    assert.throws(() => assertNoOtherBridge(paths), /another bridge is running/);

    await writeFile(paths.lockFile, '999999\n', { mode: 0o600 });
    assert.doesNotThrow(() => assertNoOtherBridge(paths));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
