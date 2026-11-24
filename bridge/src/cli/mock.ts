import { MockAdapter } from '../adapters/mock.js';
import { Bridge } from '../bridge.js';
import { loadConfig } from '../config.js';
import { describeState, installShutdown, makeLogger, openSerial, parseCli } from './common.js';

const options = parseCli(process.argv.slice(2));
const base = loadConfig();
const config = {
  ...base,
  source: 'mock' as const,
  ...(options.port !== undefined ? { port: options.port } : {}),
};
const logger = makeLogger(config.logLevel);

try {
  const { transport, path } = await openSerial(config);
  logger.info(`mock session on ${path} scenario=${options.scenario}`);
  const bridge = new Bridge({ transport, config, logger });
  const adapter = new MockAdapter(bridge, options.scenario);

  bridge.onStatus = (status) => logger.info(`bridge ${status}`);
  bridge.onState = (state) => logger.info(`state ${describeState(state)}`);
  bridge.onInteraction = (gesture, screen) => logger.info(`interaction gesture=${gesture} screen=${screen}`);

  await bridge.start();
  adapter.start();

  const stop = async (): Promise<void> => {
    adapter.stop();
    await bridge.stop();
  };
  installShutdown(stop);
  if (options.durationMs !== undefined) {
    setTimeout(() => {
      void stop().then(() => process.exit(0));
    }, options.durationMs);
  }
} catch (error) {
  logger.error(`mock failed: ${(error as Error).message}`);
  logger.info('no hardware? use: npm run simulate -- --scenario full-session');
  process.exitCode = 1;
}
