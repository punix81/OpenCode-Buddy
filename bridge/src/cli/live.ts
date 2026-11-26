import { Bridge } from '../bridge.js';
import { loadConfig } from '../config.js';
import { LiveSource } from '../live/source.js';
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

try {
  const { transport, path } = await openSerial(config);
  logger.info(`live session on ${path}`);

  const bridge = new Bridge({ transport, config, logger, transportFactory: () => openSerialTransport(config) });
  bridge.onStatus = (status) => logger.info(`bridge ${status}`);
  bridge.onState = (state) => logger.info(`state ${describeState(state)}`);
  bridge.onMcpStatus = (mcp) => logger.info(`mcp online=${mcp.online} total=${mcp.total} source=${mcp.source}`);
  bridge.onInteraction = (gesture, screen) => logger.info(`interaction gesture=${gesture} screen=${screen}`);

  const live = new LiveSource({ bridge, config, logger });
  await live.start();
  await bridge.start();

  const stop = async (): Promise<void> => {
    await live.stop();
    await bridge.stop();
    const stats = bridge.stats;
    logger.info(`summary sent=${JSON.stringify(stats.sent)}`);
    logger.info(`summary received=${JSON.stringify(stats.received)}`);
    logger.info(
      `summary ack_latency avg=${stats.ackLatency.avgMs} ms max=${stats.ackLatency.maxMs} ms count=${stats.ackLatency.count}`,
    );
  };

  installShutdown(stop);
  if (options.durationMs !== undefined) {
    setTimeout(() => {
      exitAfterStop(stop);
    }, options.durationMs);
  }
} catch (error) {
  logger.error(`live failed: ${(error as Error).message}`);
  logger.info('no device? check the cable, then: npm run diagnose');
  process.exitCode = 1;
}
