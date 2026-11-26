import { Bridge } from '../bridge.js';
import { loadConfig } from '../config.js';
import { LiveSource } from '../live/source.js';
import type { NormalizedEvent } from '../state/types.js';
import {
  describeState,
  exitAfterStop,
  installShutdown,
  makeLogger,
  openSerial,
  openSerialTransport,
  parseCli,
} from './common.js';

// LIVE is the production mode: real OpenCode events only, no simulated activity
// and no fallback to mock data. The plugin connects over the local IPC socket.
const options = parseCli(process.argv.slice(2));
const base = loadConfig();
const config = {
  ...base,
  source: 'live' as const,
  ...(options.port !== undefined ? { port: options.port } : {}),
  ...(options.logLevel !== undefined ? { logLevel: options.logLevel } : {}),
};
const logger = makeLogger(config.logLevel);

let live: LiveSource | null = null;
let bridge: Bridge | null = null;

// The IPC lock is taken before the USB port is opened. A second bridge must fail
// here, not after resetting the device by opening its port. Events that arrive
// before the serial bridge exists are queued and replayed in order.
const pending: NormalizedEvent[] = [];
const sink = {
  ingest: (event: NormalizedEvent): boolean => {
    if (bridge !== null) return bridge.ingest(event);
    if (pending.length < 500) pending.push(event);
    return true;
  },
} as unknown as Bridge;

try {
  live = new LiveSource({ bridge: sink, config, logger });
  await live.start();

  const { transport, path } = await openSerial(config);
  logger.info(`live session on ${path}`);

  bridge = new Bridge({ transport, config, logger, transportFactory: () => openSerialTransport(config) });
  bridge.onStatus = (status) => logger.info(`bridge ${status}`);
  bridge.onState = (state) => logger.info(`state ${describeState(state)}`);
  bridge.onMcpStatus = (mcp) => logger.info(`mcp online=${mcp.online} total=${mcp.total} source=${mcp.source}`);
  bridge.onInteraction = (gesture, screen) => logger.info(`interaction gesture=${gesture} screen=${screen}`);
  for (const event of pending.splice(0)) bridge.ingest(event);
  await bridge.start();

  const running = bridge;
  const stop = async (): Promise<void> => {
    await live?.stop();
    await running.stop();
    const stats = running.stats;
    logger.info(`summary sent=${JSON.stringify(stats.sent)}`);
    logger.info(`summary received=${JSON.stringify(stats.received)}`);
    logger.info(
      `summary ack_latency avg=${stats.ackLatency.avgMs} ms max=${stats.ackLatency.maxMs} ms count=${stats.ackLatency.count} expired=${stats.expiredAcks}`,
    );
  };

  installShutdown(stop);
  if (options.durationMs !== undefined) {
    setTimeout(() => {
      exitAfterStop(stop);
    }, options.durationMs);
  }
} catch (error) {
  await live?.stop().catch(() => undefined);
  logger.error(`live failed: ${(error as Error).message}`);
  logger.info('no device? check the cable, then: npm run diagnose');
  process.exitCode = 1;
}
