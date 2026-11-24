import assert from 'node:assert/strict';
import test from 'node:test';

import { Bridge } from '../src/bridge.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { NullLogger } from '../src/logger.js';
import { Simulator } from '../src/simulator/simulator.js';
import { MemoryTransport } from '../src/transport/memory.js';

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

  assert.equal(bridge.status, 'ready');
  assert.equal(simulator.statusValue, 'ready');
  assert.ok(simulator.lastState);
  assert.equal(simulator.lastState?.status, 'idle');
  assert.equal(simulator.lastState?.source, 'live');

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
