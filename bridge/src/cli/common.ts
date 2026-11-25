import { ConsoleLogger, type Logger } from '../logger.js';
import type { BridgeConfig } from '../config.js';
import type { StateData } from '../protocol/types.js';
import { DeviceDiscovery } from '../device/discovery.js';
import { SerialTransport } from '../transport/serial.js';
import type { Transport } from '../transport/types.js';

export interface CliOptions {
  port?: string;
  scenario: 'full-session' | 'permission' | 'multi-session' | 'error' | 'all-states' | 'stress';
  durationMs?: number;
  logLevel?: BridgeConfig['logLevel'];
}

export function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { scenario: 'full-session' };
  const levels: BridgeConfig['logLevel'][] = ['error', 'warn', 'info', 'debug'];
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--log-level' && next !== undefined) {
      if (levels.includes(next as BridgeConfig['logLevel'])) {
        options.logLevel = next as BridgeConfig['logLevel'];
      }
      ++i;
    } else if (arg === '--port' && next !== undefined) {
      options.port = next;
      ++i;
    } else if (arg === '--scenario' && next !== undefined) {
      if (['full-session', 'permission', 'multi-session', 'error', 'all-states', 'stress'].includes(next)) {
        options.scenario = next as CliOptions['scenario'];
      }
      ++i;
    } else if (arg === '--duration' && next !== undefined) {
      const value = Number.parseInt(next, 10);
      if (Number.isFinite(value) && value > 0) {
        options.durationMs = value;
      }
      ++i;
    }
  }
  return options;
}

export function makeLogger(level: BridgeConfig['logLevel']): Logger {
  return new ConsoleLogger(level);
}

export async function openSerial(
  config: BridgeConfig,
): Promise<{ transport: Transport; path: string }> {
  const discovery = new DeviceDiscovery();
  const candidate = await discovery.select(config);
  return {
    transport: new SerialTransport({ path: candidate.path, baudRate: config.baudRate }),
    path: candidate.path,
  };
}

export function describeState(state: StateData): string {
  const hasTokens =
    state.tokens !== undefined &&
    (state.tokens.input !== null && state.tokens.input !== undefined ||
      state.tokens.output !== null && state.tokens.output !== undefined);
  const tokens = hasTokens
    ? `${state.tokens?.input ?? '--'}/${state.tokens?.output ?? '--'}`
    : '--/--';
  const tools = state.tools
    ? `${state.tools.success}/${state.tools.failed}/${state.tools.running}`
    : '--';
  return `status=${state.status} sessions=${state.activeSessions} tokens=${tokens} tools=${tools} source=${state.source}`;
}

// A CLI must terminate even when a transport refuses to close (a half-open CDC
// fd does that). Give the orderly shutdown a bounded budget, then exit.
const SHUTDOWN_TIMEOUT_MS = 5000;

export function exitAfterStop(stop: () => Promise<void>, code = 0): void {
  const watchdog = setTimeout(() => process.exit(code), SHUTDOWN_TIMEOUT_MS);
  watchdog.unref();
  void stop().finally(() => {
    clearTimeout(watchdog);
    process.exit(code);
  });
}

export function installShutdown(stop: () => Promise<void>): void {
  let stopping = false;
  const handler = (): void => {
    if (stopping) return;
    stopping = true;
    exitAfterStop(stop);
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}
