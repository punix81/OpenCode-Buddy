import assert from 'node:assert/strict';
import test from 'node:test';

import { Bridge, CLOSE_TIMEOUT_MS, HANDSHAKE_TIMEOUT_MS } from '../src/bridge.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { NullLogger } from '../src/logger.js';
import { Simulator } from '../src/simulator/simulator.js';
import { LineFramer, encodeMessage } from '../src/protocol/codec.js';
import { MemoryTransport } from '../src/transport/memory.js';
import type { Transport, TransportHandlers } from '../src/transport/types.js';

async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; ++i) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function config(source: 'live' | 'mock' = 'live') {
  return {
    ...DEFAULT_CONFIG,
    source,
    heartbeatMs: 50,
    linkTimeoutMs: 200,
    stateIntervalMs: 50,
  };
}

test('handshake completes and a snapshot reaches the device', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const clock = { now: 1000 };
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });

  await bridge.start();
  await simulator.start();
  await settle();
  // The snapshot is deferred to the next tick so the handshake burst stays
  // below the device RX queue size.
  bridge.tick(clock.now);
  await settle();

  assert.equal(bridge.status, 'ready');
  assert.equal(simulator.statusValue, 'ready');
  assert.ok(simulator.lastState);
  // LIVE without an OpenCode peer is OFFLINE, even though USB is ready.
  assert.equal(simulator.lastState?.status, 'offline');
  assert.equal(simulator.lastState?.source, 'live');
  // A legacy firmware (no caps) still receives the fields it requires.
  assert.equal(simulator.lastConfig?.language, 'en');
  assert.equal(simulator.lastConfig?.quietMode, false);

  await bridge.stop();
  await simulator.stop();
});

test('mock source is carried to the device', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config('mock'),
    logger: new NullLogger(),
    autoTimers: false,
  });
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });

  await bridge.start();
  await simulator.start();
  await settle();
  bridge.tick(Date.now());
  await settle();

  assert.equal(simulator.lastState?.source, 'mock');
  await bridge.stop();
  await simulator.stop();
});

test('interactions are forwarded and never act on the device', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
  });
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });
  let received: { gesture: string; screen: number } | null = null;
  bridge.onInteraction = (gesture, screen) => {
    received = { gesture, screen };
  };

  await bridge.start();
  await simulator.start();
  await settle();
  simulator.sendInteraction('short', 3);
  await settle();

  assert.deepEqual(received, { gesture: 'short', screen: 3 });
  await bridge.stop();
  await simulator.stop();
});

test('a silent device degrades the bridge and the snapshot reports offline', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const clock = { now: 1000 };
  const statuses: string[] = [];
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });
  bridge.onStatus = (status) => statuses.push(status);
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });

  await bridge.start();
  await simulator.start();
  await settle();
  assert.equal(bridge.status, 'ready');

  clock.now += 301;
  bridge.tick(clock.now);
  await settle();

  assert.ok(statuses.includes('degraded'));
  assert.equal(simulator.lastState?.status, 'offline');
  await bridge.stop();
  await simulator.stop();
});

test('an incompatible protocol major is rejected', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
  });
  const simulator = new Simulator({
    transport: deviceSide,
    logger: new NullLogger(),
    autoTimers: false,
    protocols: [2],
  });

  await bridge.start();
  await simulator.start();
  await settle();

  assert.equal(bridge.status, 'error');
  await bridge.stop();
  await simulator.stop();
});

// A transport whose failures are triggered by the test, to model a cable
// unplug or a driver-level error (seen on hardware as ENOTSUP from modem
// control before the port call was removed).
class FlakyTransport implements Transport {
  handlers: TransportHandlers = {};
  openCalls = 0;
  closed = false;
  private openState = false;

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }

  async open(): Promise<void> {
    ++this.openCalls;
    this.openState = true;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.openState = false;
    this.handlers.onClose?.();
  }

  isOpen(): boolean {
    return this.openState;
  }

  async write(): Promise<void> {
    if (!this.openState) throw new Error('transport is closed');
  }

  fail(message = 'Operation not supported, cannot set'): void {
    this.handlers.onError?.(new Error(message));
  }
}

test('a transport error is a link loss, not a fatal error', async () => {
  const transport = new FlakyTransport();
  const statuses: string[] = [];
  const bridge = new Bridge({
    transport,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
  });
  bridge.onStatus = (status) => statuses.push(status);

  await bridge.start();
  assert.equal(bridge.status, 'handshaking');

  transport.fail();
  await settle();

  assert.equal(transport.closed, true);
  assert.ok(statuses.includes('reconnecting'));
  assert.equal(statuses.includes('error'), false);
  await bridge.stop();
});

test('a transport error schedules a reopen with backoff', async () => {
  const transport = new FlakyTransport();
  const bridge = new Bridge({
    transport,
    config: { ...config(), reconnectDelaysMs: [5] },
    logger: new NullLogger(),
  });

  await bridge.start();
  assert.equal(transport.openCalls, 1);

  transport.fail('EIO');
  await new Promise<void>((resolve) => setTimeout(resolve, 60));

  assert.ok(transport.openCalls >= 2, `openCalls=${transport.openCalls}`);
  await bridge.stop();
});

// Records outbound frames so handshake bursts can be counted.
class RecordingTransport implements Transport {
  handlers: TransportHandlers = {};
  writes: string[] = [];
  private openState = false;

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }

  async open(): Promise<void> {
    this.openState = true;
  }

  async close(): Promise<void> {
    this.openState = false;
  }

  isOpen(): boolean {
    return this.openState;
  }

  async write(data: string): Promise<void> {
    this.writes.push(data);
  }

  feed(line: string): void {
    this.handlers.onData?.(Buffer.from(`${line}\n`, 'utf8'));
  }

  count(type: string): number {
    return this.writes.filter((line) => line.includes(`"type":"${type}"`)).length;
  }
}

const hello = (boot: number, seq = 1): string =>
  JSON.stringify({
    v: 1,
    type: 'hello',
    seq,
    data: { device: 'opencode-buddy', fw: '0.2.0', proto: [1], maxLine: 2048, boot },
  });

test('buffered duplicate hellos do not trigger repeated snapshots', async () => {
  const transport = new RecordingTransport();
  const clock = { now: 1000 };
  const bridge = new Bridge({
    transport,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });

  await bridge.start();
  transport.feed(hello(7));
  await settle();
  bridge.tick(clock.now);
  await settle();
  assert.equal(transport.count('state'), 1);
  assert.equal(transport.count('ready'), 1);

  // Three stale announcements flushed from the device buffer after the open.
  for (let i = 0; i < 3; ++i) {
    clock.now += 10;
    transport.feed(hello(7));
    await settle();
    bridge.tick(clock.now);
    await settle();
  }
  assert.equal(transport.count('state'), 1, 'no extra snapshot for the same boot');
  assert.equal(transport.count('ready'), 1);

  // A real restart increments the boot counter and must handshake again.
  clock.now += 10;
  transport.feed(hello(8));
  await settle();
  bridge.tick(clock.now);
  await settle();
  assert.equal(transport.count('state'), 2);
  assert.equal(transport.count('ready'), 2);

  // A later announcement with the same boot is a new session, not a burst.
  clock.now += 5000;
  transport.feed(hello(8));
  await settle();
  bridge.tick(clock.now);
  await settle();
  assert.equal(transport.count('state'), 3);

  await bridge.stop();
  assert.equal(bridge.status, 'idle');
});

// A silent transport models the failure seen on hardware: the CDC port is open
// but the device's `hello` never arrives, and no close or error event is ever
// emitted. Before the timeout existed, the bridge stayed in `handshaking` for
// the whole session and never sent a single state frame.
class SilentTransport implements Transport {
  private handlers: TransportHandlers = {};
  openCalls = 0;
  closeCalls = 0;
  closed = false;

  constructor(private readonly closeImpl: () => Promise<void> = async () => {}) {}

  async open(): Promise<void> {
    ++this.openCalls;
  }

  close(): Promise<void> {
    ++this.closeCalls;
    this.closed = true;
    return this.closeImpl();
  }

  async write(): Promise<void> {}

  isOpen(): boolean {
    return true;
  }

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }
}

test('a missing hello times out instead of waiting forever', async () => {
  const transport = new SilentTransport();
  const clock = { now: 5000 };
  const bridge = new Bridge({
    transport,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });

  await bridge.start();
  assert.equal(bridge.status, 'handshaking');

  bridge.tick(clock.now + HANDSHAKE_TIMEOUT_MS - 1);
  await settle();
  assert.equal(bridge.status, 'handshaking', 'must wait for the announcement period');
  assert.equal(transport.closeCalls, 0);

  bridge.tick(clock.now + HANDSHAKE_TIMEOUT_MS);
  await settle();
  assert.equal(bridge.status, 'reconnecting');
  assert.equal(transport.closed, true, 'the port is released before reopening');

  await bridge.stop();
});

test('stop() completes when the transport never closes', async () => {
  const transport = new SilentTransport(() => new Promise<void>(() => {}));
  const bridge = new Bridge({
    transport,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
  });

  await bridge.start();
  const started = Date.now();
  await bridge.stop();
  const elapsed = Date.now() - started;

  assert.equal(bridge.status, 'idle');
  assert.equal(transport.closeCalls, 1);
  assert.ok(
    elapsed >= CLOSE_TIMEOUT_MS - 100,
    `stop() returned before the close budget elapsed (${elapsed} ms)`,
  );
  assert.ok(elapsed < CLOSE_TIMEOUT_MS + 2000, `stop() took ${elapsed} ms`);
});

test('a link loss recreates the transport so a re-enumerated port is found', async () => {
  const [initial, deviceA] = MemoryTransport.pair();
  const simA = new Simulator({ transport: deviceA, logger: new NullLogger(), autoTimers: false });
  let factoryCalls = 0;
  const factory = async (): Promise<Transport> => {
    ++factoryCalls;
    const [bridgeSide, deviceSide] = MemoryTransport.pair();
    const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });
    return {
      setHandlers: (handlers) => bridgeSide.setHandlers(handlers),
      open: async () => {
        await bridgeSide.open();
        await simulator.start();
      },
      close: async () => {
        await simulator.stop();
        await bridgeSide.close();
      },
      isOpen: () => bridgeSide.isOpen(),
      write: (data: string) => bridgeSide.write(data),
    };
  };

  const bridge = new Bridge({
    transport: initial,
    config: { ...config(), reconnectDelaysMs: [10] },
    logger: new NullLogger(),
    transportFactory: factory,
  });
  try {
    await bridge.start();
    await simA.start();
    await settle();
    assert.equal(bridge.status, 'ready');

    await simA.stop();
    await initial.close();
    for (let i = 0; i < 100 && bridge.status !== 'ready'; ++i) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(factoryCalls, 1);
    assert.equal(bridge.status, 'ready');
  } finally {
    await bridge.stop();
    await simA.stop();
  }
});

test('an unacknowledged frame expires instead of being tracked forever', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const clock = { now: 1000 };
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });
  try {
    await bridge.start();
    await deviceSide.open();
    await deviceSide.write(
      `${encodeMessage({
        v: 1,
        type: 'hello',
        seq: 1,
        data: {
          device: 'opencode-buddy',
          fw: 'test',
          proto: [1],
          maxLine: 2048,
          boot: 1,
        },
      })}\n`,
    );
    await settle();
    assert.equal(bridge.status, 'ready');
    bridge.tick(clock.now);
    await settle();
    clock.now += 11000;
    bridge.tick(clock.now);
    assert.ok(bridge.stats.expiredAcks > 0);
  } finally {
    await bridge.stop();
    await deviceSide.close();
  }
});


test('an explicit host override is the only way to change a device preference', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const clock = { now: 1000 };
  const bridge = new Bridge({
    transport: bridgeSide,
    config: { ...config(), language: 'fr', quietMode: true },
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });
  try {
    await bridge.start();
    await simulator.start();
    await settle();
    assert.equal(simulator.lastConfig?.language, 'fr');
    assert.equal(simulator.lastConfig?.quietMode, true);
  } finally {
    await bridge.stop();
    await simulator.stop();
  }
});


test('a firmware with config.partial keeps its display preferences', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const bridge = new Bridge({
    transport: bridgeSide,
    config: config(),
    logger: new NullLogger(),
    autoTimers: false,
  });
  const simulator = new Simulator({
    transport: deviceSide,
    logger: new NullLogger(),
    autoTimers: false,
    caps: ['config.partial'],
  });
  try {
    await bridge.start();
    await simulator.start();
    await settle();
    assert.equal(simulator.lastConfig?.language, undefined);
    assert.equal(simulator.lastConfig?.quietMode, undefined);
  } finally {
    await bridge.stop();
    await simulator.stop();
  }
});


test('state frames are paced by stateIntervalMs during an event burst', async () => {
  const [bridgeSide, deviceSide] = MemoryTransport.pair();
  const clock = { now: 1000 };
  const bridge = new Bridge({
    transport: bridgeSide,
    config: { ...config(), stateIntervalMs: 1000, linkTimeoutMs: 60000 },
    logger: new NullLogger(),
    autoTimers: false,
    now: () => clock.now,
  });
  const simulator = new Simulator({ transport: deviceSide, logger: new NullLogger(), autoTimers: false });
  try {
    await bridge.start();
    await simulator.start();
    await settle();
    bridge.tick(clock.now);
    await settle();

    let states = 0;
    bridge.onState = () => ++states;
    for (let i = 0; i < 10; ++i) {
      clock.now += 100;
      bridge.ingest({ kind: 'usage', sessionId: 's', at: clock.now, input: i + 1 });
      bridge.tick(clock.now);
      await settle();
    }
    // Nine ticks are inside the 1 s window; the tenth reaches it.
    assert.equal(states, 1);
  } finally {
    await bridge.stop();
    await simulator.stop();
  }
});
