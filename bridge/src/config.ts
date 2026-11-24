import { readFileSync } from 'node:fs';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BridgeConfig {
  port: string | null;
  autoDetect: boolean;
  baudRate: number;
  heartbeatMs: number;
  linkTimeoutMs: number;
  stateIntervalMs: number;
  reconnectDelaysMs: number[];
  logLevel: LogLevel;
  allowRealMcpNames: boolean;
  source: 'live' | 'mock';
}

export const DEFAULT_CONFIG: BridgeConfig = {
  port: null,
  autoDetect: true,
  baudRate: 115200,
  heartbeatMs: 2000,
  linkTimeoutMs: 6000,
  stateIntervalMs: 1000,
  reconnectDelaysMs: [1000, 2000, 4000, 8000, 15000],
  logLevel: 'info',
  allowRealMcpNames: false,
  source: 'live',
};

export class ConfigError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function parseConfig(value: unknown): BridgeConfig {
  if (!isRecord(value)) {
    throw new ConfigError('configuration must be an object');
  }
  const config: BridgeConfig = { ...DEFAULT_CONFIG, ...value } as BridgeConfig;

  if (config.port !== null && typeof config.port !== 'string') {
    throw new ConfigError('port must be a string or null');
  }
  if (typeof config.autoDetect !== 'boolean') {
    throw new ConfigError('autoDetect must be a boolean');
  }
  config.baudRate = positiveInt(config.baudRate, 'baudRate', 9600, 3000000);
  config.heartbeatMs = positiveInt(config.heartbeatMs, 'heartbeatMs', 250, 60000);
  config.linkTimeoutMs = positiveInt(config.linkTimeoutMs, 'linkTimeoutMs', 500, 120000);
  config.stateIntervalMs = positiveInt(config.stateIntervalMs, 'stateIntervalMs', 100, 60000);
  if (!Array.isArray(config.reconnectDelaysMs) || config.reconnectDelaysMs.length === 0) {
    throw new ConfigError('reconnectDelaysMs must be a non-empty array');
  }
  config.reconnectDelaysMs = config.reconnectDelaysMs.map((delay, index) =>
    positiveInt(delay, `reconnectDelaysMs[${index}]`, 100, 300000),
  );
  if (!['error', 'warn', 'info', 'debug'].includes(config.logLevel)) {
    throw new ConfigError('logLevel is invalid');
  }
  if (typeof config.allowRealMcpNames !== 'boolean') {
    throw new ConfigError('allowRealMcpNames must be a boolean');
  }
  if (config.source !== 'live' && config.source !== 'mock') {
    throw new ConfigError('source must be live or mock');
  }
  return config;
}

// Reads a local JSON file if present. Never logs its content.
export function loadConfig(file = process.env['BUDDY_CONFIG'] ?? 'config.local.json'): BridgeConfig {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { ...DEFAULT_CONFIG };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigError(`configuration file is not valid JSON: ${file}`);
  }
  return parseConfig(parsed);
}
