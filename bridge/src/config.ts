import { readFileSync } from 'node:fs';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BridgeConfig {
  port: string | null;
  autoDetect: boolean;
  baudRate: number;
  heartbeatMs: number;
  linkTimeoutMs: number;
  stateIntervalMs: number;
  // Seconds before a non-Buddy dashboard returns to Buddy. Device default 60.
  autoReturnSeconds: number;
  reconnectDelaysMs: number[];
  logLevel: LogLevel;
  allowRealMcpNames: boolean;
  language: 'en' | 'fr' | 'de' | null;
  quietMode: boolean | null;
  source: 'live' | 'mock';
}

export const DEFAULT_CONFIG: BridgeConfig = {
  port: null,
  autoDetect: true,
  baudRate: 115200,
  heartbeatMs: 2000,
  linkTimeoutMs: 6000,
  stateIntervalMs: 1000,
  autoReturnSeconds: 60,
  reconnectDelaysMs: [1000, 2000, 4000, 8000, 15000],
  logLevel: 'info',
  allowRealMcpNames: false,
  language: null,
  quietMode: null,
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
  config.autoReturnSeconds = positiveInt(config.autoReturnSeconds, 'autoReturnSeconds', 10, 600);
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
  if (config.language !== null && !['en', 'fr', 'de'].includes(config.language)) {
    throw new ConfigError('language must be null, en, fr or de');
  }
  if (config.quietMode !== null && typeof config.quietMode !== 'boolean') {
    throw new ConfigError('quietMode must be null or a boolean');
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
