import { Bridge } from '../bridge.js';
import { loadConfig } from '../config.js';
import { describeState, installShutdown, makeLogger, openSerial, parseCli } from './common.js';

const options = parseCli(process.argv.slice(2));
const config = {
  ...loadConfig(),
  ...(options.port !== undefined ? { port: options.port } : {}),
  logLevel: 'debug' as const,
};
const logger = makeLogger(config.logLevel);

try {
  const { transport, path } = await openSerial(config);
  logger.info(`diagnose port=${path} baud=${config.baudRate}`);
  const bridge = new Bridge({ transport, config, logger });

  bridge.onStatus = (status) => logger.info(`bridge ${status}`);
  bridge.onState = (state) => logger.info(`state ${describeState(state)}`);
  bridge.onMcpStatus = (mcp) => logger.info(`mcp online=${mcp.online} total=${mcp.total} source=${mcp.source}`);
  bridge.onInteraction = (gesture, screen) => logger.info(`interaction gesture=${gesture} screen=${screen}`);

  await bridge.start();
  const stop = async (): Promise<void> => {
    await bridge.stop();
  };
  installShutdown(stop);
  if (options.durationMs !== undefined) {
    setTimeout(() => {
      void stop().then(() => process.exit(0));
    }, options.durationMs);
  }
} catch (error) {
  logger.error(`diagnose failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
