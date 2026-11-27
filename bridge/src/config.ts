import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BridgeConfig {
  port: string | null;
  autoDetect: boolean;
  // Stable selection when several Espressif devices are connected.
  deviceSerial: string | null;
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
  // Installer/startup preference; the bridge itself does not register a service.
  autoStart: boolean;
  // Opt-in additional local diagnostics; never prompt/tool content.
  diagnostics: boolean;
  // Explicit alias overrides for MCP servers; the device still receives only
  // the aliases, never the real names unless allowRealMcpNames is true.
  mcpAliases: Record<string, string>;
  source: 'live' | 'mock';
}

export const DEFAULT_CONFIG: BridgeConfig = {
  port: null,
  autoDetect: true,
  deviceSerial: null,
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
  autoStart: false,
  diagnostics: false,
  mcpAliases: {},
  source: 'live',
};

export class ConfigError extends Error {}

const CONFIG_KEYS = new Set([
  'port',
  'autoDetect',
  'deviceSerial',
  'baudRate',
  'heartbeatMs',
  'linkTimeoutMs',
  'stateIntervalMs',
  'autoReturnSeconds',
  'reconnectDelaysMs',
  'logLevel',
  'allowRealMcpNames',
  'language',
  'quietMode',
  'autoStart',
  'diagnostics',
  'mcpAliases',
  'source',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ConfigError(`${field} must be a string`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (cleaned.length === 0 || cleaned.length > max) {
    throw new ConfigError(`${field} must contain 1..${max} printable characters`);
  }
  return cleaned;
}

function parseAliases(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new ConfigError('mcpAliases must be an object');
  const entries = Object.entries(value);
  if (entries.length > 16) throw new ConfigError('mcpAliases supports at most 16 entries');
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const [name, alias] of entries) {
    if (name.length === 0 || name.length > 64) {
      throw new ConfigError('mcpAliases keys must contain 1..64 characters');
    }
    const cleaned = boundedString(alias, `mcpAliases.${name}`, 12);
    if (used.has(cleaned)) {
      throw new ConfigError(`mcpAliases.${name} duplicates alias ${cleaned}`);
    }
    used.add(cleaned);
    result[name] = cleaned;
  }
  return result;
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
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new ConfigError(`unknown configuration key: ${key}`);
    }
  }
  const config: BridgeConfig = { ...DEFAULT_CONFIG, ...value } as BridgeConfig;

  if (config.port !== null && typeof config.port !== 'string') {
    throw new ConfigError('port must be a string or null');
  }
  if (config.port !== null && config.port.trim().length === 0) {
    throw new ConfigError('port must not be empty');
  }
  if (config.deviceSerial !== null &&
      (typeof config.deviceSerial !== 'string' || config.deviceSerial.trim().length === 0 ||
       config.deviceSerial.length > 128)) {
    throw new ConfigError('deviceSerial must be null or a non-empty string of at most 128 characters');
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
  if (typeof config.autoStart !== 'boolean') {
    throw new ConfigError('autoStart must be a boolean');
  }
  if (typeof config.diagnostics !== 'boolean') {
    throw new ConfigError('diagnostics must be a boolean');
  }
  config.mcpAliases = parseAliases(config.mcpAliases);
  if (config.source !== 'live' && config.source !== 'mock') {
    throw new ConfigError('source must be live or mock');
  }
  return config;
}

// Reads a local JSON file if present. Never logs its content. The development
// cwd file wins for an existing checkout; installed use reads the platform
// config path (XDG_CONFIG_HOME/~/.config on Unix, %APPDATA% on Windows).
export function defaultConfigFile(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd(),
): string {
  const explicit = env['BUDDY_CONFIG'];
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const local = join(cwd, 'config.local.json');
  if (existsSync(local)) return local;
  if (platform === 'win32') {
    const base = env['APPDATA'] ?? join(env['USERPROFILE'] ?? '.', 'AppData', 'Roaming');
    return join(base, 'opencode-buddy', 'config.json');
  }
  const base = env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
  return join(base, 'opencode-buddy', 'config.json');
}

export function loadConfig(file?: string): BridgeConfig {
  const target = file ?? defaultConfigFile();
  let text: string;
  try {
    text = readFileSync(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && file === undefined && !process.env['BUDDY_CONFIG']) {
      return { ...DEFAULT_CONFIG };
    }
    throw new ConfigError('configuration file could not be read: ' + target);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigError(`configuration file is not valid JSON: ${target}`);
  }
  return parseConfig(parsed);
}
