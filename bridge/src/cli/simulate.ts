import { MockAdapter } from '../adapters/mock.js';
import { Bridge } from '../bridge.js';
import { loadConfig } from '../config.js';
import { Simulator } from '../simulator/simulator.js';
import { MemoryTransport } from '../transport/memory.js';
import { describeState, makeLogger, parseCli } from './common.js';

const options = parseCli(process.argv.slice(2));
const logger = makeLogger('info');
const config = { ...loadConfig(), source: 'mock' as const };
const [bridgeSide, deviceSide] = MemoryTransport.pair();

const bridge = new Bridge({ transport: bridgeSide, config, logger });
const simulator = new Simulator({ transport: deviceSide, logger });
// The simulator has no device-side stress mode; fall back to the richest mock
// scenario instead of pretending to run it.
const scenario = options.scenario === 'stress' ? 'all-states' : options.scenario;
const adapter = new MockAdapter(bridge, scenario);

bridge.onStatus = (status) => logger.info(`bridge ${status}`);
bridge.onState = (state) => logger.info(`state ${describeState(state)}`);
simulator.onState = (state) => logger.info(`device received ${state.status} screen-source=${state.source}`);

await bridge.start();
await simulator.start();
adapter.start();

const duration = options.durationMs ?? 20000;
logger.info(`simulator scenario=${options.scenario} duration=${duration} ms`);
setTimeout(() => {
  adapter.stop();
  void simulator.stop().then(() => bridge.stop()).then(() => process.exit(0));
}, duration);
