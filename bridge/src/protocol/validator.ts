import {
  ERROR_CODES,
  MAX_LINE_BYTES,
  PROTOCOL_MAJOR,
  STATUSES,
  type AckData,
  type AnyMessage,
  type BridgeLink,
  type ConfigData,
  type ErrorCode,
  type ErrorData,
  type HelloData,
  type InteractionData,
  type McpServerSummary,
  type McpStatus,
  type McpStatusData,
  type OpenCodeLink,
  type ReadyData,
  type ResyncData,
  type Source,
  type StateData,
  type Status,
  type Tokens,
  type Tools,
} from './types.js';

export type ValidationResult =
  | { ok: true; message: AnyMessage }
  | { ok: false; code: ErrorCode; detail: string };

class ValidationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Obj = Record<string, unknown>;

const STATUS_SET = new Set<string>(STATUSES);
const ERROR_SET = new Set<string>(ERROR_CODES);
const MCP_SET = new Set(['connected', 'pending', 'disabled', 'failed', 'needs_auth']);
const GESTURE_SET = new Set(['short', 'double', 'long', 'very_long']);
const SOURCE_SET = new Set(['live', 'mock']);

function fail(code: ErrorCode, detail: string): never {
  throw new ValidationError(code, detail);
}

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObj(value: unknown, what: string): Obj {
  if (!isObj(value)) {
    fail('E_PARSE', `${what} must be an object`);
  }
  return value;
}

function onlyKeys(obj: Obj, allowed: readonly string[], what: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail('E_PARSE', `${what} has unknown field ${key}`);
    }
  }
}

function u32(value: unknown, what: string, min = 0, max = 0xffffffff): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail('E_PARSE', `${what} must be an integer`);
  }
  if (value < min || value > max) {
    fail('E_BOUNDS', `${what} out of range`);
  }
  return value;
}

function u8(value: unknown, what: string, min = 0, max = 255): number {
  return u32(value, what, min, max);
}

function bool(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') {
    fail('E_PARSE', `${what} must be a boolean`);
  }
  return value;
}

function str(value: unknown, what: string, maxLength: number): string {
  if (typeof value !== 'string') {
    fail('E_PARSE', `${what} must be a string`);
  }
  if (value.length > maxLength) {
    fail('E_BOUNDS', `${what} too long`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<string>, what: string): T {
  if (typeof value !== 'string' || !allowed.has(value)) {
    fail('E_BOUNDS', `${what} has an unknown value`);
  }
  return value as T;
}

function nullableU32(value: unknown, what: string): number | null {
  if (value === null) {
    return null;
  }
  return u32(value, what);
}

function validateTokens(value: unknown): Tokens {
  const tokens = asObj(value, 'tokens');
  onlyKeys(tokens, ['input', 'output', 'total', 'contextPct'], 'tokens');
  const result: Tokens = {};
  if ('input' in tokens) result.input = nullableU32(tokens['input'], 'tokens.input');
  if ('output' in tokens) result.output = nullableU32(tokens['output'], 'tokens.output');
  if ('total' in tokens) result.total = nullableU32(tokens['total'], 'tokens.total');
  if ('contextPct' in tokens) {
    const pct = tokens['contextPct'];
    if (pct === null) {
      result.contextPct = null;
    } else {
      if (typeof pct !== 'number' || !Number.isFinite(pct)) {
        fail('E_PARSE', 'tokens.contextPct must be a number or null');
      }
      if (pct < 0 || pct > 100) {
        fail('E_BOUNDS', 'tokens.contextPct out of range');
      }
      result.contextPct = pct;
    }
  }
  return result;
}

function validateTools(value: unknown): Tools {
  const tools = asObj(value, 'tools');
  onlyKeys(tools, ['success', 'failed', 'running', 'categories'], 'tools');
  const result: Tools = {};
  if ('success' in tools) result.success = u32(tools['success'], 'tools.success');
  if ('failed' in tools) result.failed = u32(tools['failed'], 'tools.failed');
  if ('running' in tools) result.running = u8(tools['running'], 'tools.running');
  if ('categories' in tools) {
    const categories = asObj(tools['categories'], 'tools.categories');
    onlyKeys(categories, ['read', 'edit', 'shell', 'search', 'mcp', 'other'], 'tools.categories');
    const parsed: NonNullable<Tools['categories']> = {};
    for (const key of ['read', 'edit', 'shell', 'search', 'mcp', 'other'] as const) {
      if (key in categories) {
        parsed[key] = u32(categories[key], `tools.categories.${key}`);
      }
    }
    result.categories = parsed;
  }
  return result;
}

function validateState(data: Obj): StateData {
  onlyKeys(
    data,
    [
      'status',
      'model',
      'agent',
      'activeSessions',
      'elapsedSeconds',
      'pendingPermissions',
      'pendingQuestions',
      'notifications',
      'retryAttempt',
      'tokens',
      'tools',
      'mcp',
      'connection',
      'versions',
      'source',
      'diagnostic',
    ],
    'state',
  );

  if (!('status' in data)) fail('E_PARSE', 'status is required');
  if (!('source' in data)) fail('E_PARSE', 'source is required');
  if (!('activeSessions' in data)) fail('E_PARSE', 'activeSessions is required');
  if (!('connection' in data)) fail('E_PARSE', 'connection is required');
  if (!('versions' in data)) fail('E_PARSE', 'versions is required');

  const result: StateData = {
    status: enumValue<Status>(data['status'], STATUS_SET, 'status'),
    activeSessions: u32(data['activeSessions'], 'activeSessions', 0, 65535),
    connection: { bridge: 'ready', opencode: 'unknown' },
    versions: { bridge: '', protocol: PROTOCOL_MAJOR },
    source: enumValue<Source>(data['source'], SOURCE_SET, 'source'),
  };

  if ('model' in data) {
    result.model = data['model'] === null ? null : str(data['model'], 'model', 40);
  }
  if ('agent' in data) {
    result.agent = data['agent'] === null ? null : str(data['agent'], 'agent', 24);
  }
  if ('elapsedSeconds' in data) result.elapsedSeconds = u32(data['elapsedSeconds'], 'elapsedSeconds');
  if ('pendingPermissions' in data) {
    result.pendingPermissions = u8(data['pendingPermissions'], 'pendingPermissions');
  }
  if ('pendingQuestions' in data) {
    result.pendingQuestions = u8(data['pendingQuestions'], 'pendingQuestions');
  }
  if ('notifications' in data) {
    result.notifications = u8(data['notifications'], 'notifications', 0, 99);
  }
  if ('retryAttempt' in data) result.retryAttempt = u8(data['retryAttempt'], 'retryAttempt');

  const connection = asObj(data['connection'], 'connection');
  onlyKeys(connection, ['bridge', 'opencode'], 'connection');
  if (!('bridge' in connection)) fail('E_PARSE', 'connection.bridge is required');
  if (!('opencode' in connection)) fail('E_PARSE', 'connection.opencode is required');
  result.connection.bridge = enumValue<BridgeLink>(
    connection['bridge'],
    new Set(['ready', 'degraded']),
    'connection.bridge',
  );
  result.connection.opencode = enumValue<OpenCodeLink>(
    connection['opencode'],
    new Set(['connected', 'offline', 'unknown']),
    'connection.opencode',
  );

  const versions = asObj(data['versions'], 'versions');
  onlyKeys(versions, ['bridge', 'protocol'], 'versions');
  result.versions.bridge = str(versions['bridge'], 'versions.bridge', 16);
  result.versions.protocol = u8(versions['protocol'], 'versions.protocol', 1, 255);

  if ('tokens' in data) result.tokens = validateTokens(data['tokens']);
  if ('tools' in data) result.tools = validateTools(data['tools']);
  if ('mcp' in data) {
    const mcp = asObj(data['mcp'], 'mcp');
    onlyKeys(mcp, ['online', 'total'], 'mcp');
    result.mcp = {
      online: u8(mcp['online'], 'mcp.online'),
      total: u8(mcp['total'], 'mcp.total'),
    };
  }
  if ('diagnostic' in data) {
    const diagnostic = asObj(data['diagnostic'], 'diagnostic');
    onlyKeys(diagnostic, ['code'], 'diagnostic');
    const code = enumValue<ErrorCode>(diagnostic['code'], ERROR_SET, 'diagnostic.code');
    result.diagnostic = { code };
  }
  return result;
}

function validateHello(data: Obj): HelloData {
  onlyKeys(data, ['device', 'fw', 'proto', 'maxLine', 'boot'], 'hello');
  if (data['device'] !== 'opencode-buddy') {
    fail('E_BOUNDS', 'hello.device is unknown');
  }
  const proto = data['proto'];
  if (!Array.isArray(proto) || proto.length < 1 || proto.length > 8) {
    fail('E_PARSE', 'hello.proto must be an array');
  }
  const majors = proto.map((value) => u8(value, 'hello.proto', 1, 255));
  return {
    device: 'opencode-buddy',
    fw: str(data['fw'], 'hello.fw', 16),
    proto: majors,
    maxLine: u32(data['maxLine'], 'hello.maxLine', 256, MAX_LINE_BYTES),
    boot: u32(data['boot'], 'hello.boot'),
  };
}

function validateReady(data: Obj): ReadyData {
  onlyKeys(data, ['bridge', 'proto', 'run'], 'ready');
  const run = str(data['run'], 'ready.run', 8);
  if (!/^[0-9a-f]{1,8}$/.test(run)) {
    fail('E_PARSE', 'ready.run must be hex');
  }
  return {
    bridge: str(data['bridge'], 'ready.bridge', 16),
    proto: u8(data['proto'], 'ready.proto', 1, 255),
    run,
  };
}

function validateConfig(data: Obj): ConfigData {
  onlyKeys(data, ['language', 'quietMode', 'autoReturnSeconds', 'gestures', 'source'], 'config');
  const gestures = asObj(data['gestures'], 'config.gestures');
  onlyKeys(
    gestures,
    ['debounceMs', 'doublePressWindowMs', 'longPressMs', 'veryLongPressMs'],
    'config.gestures',
  );
  return {
    language: enumValue<'en' | 'fr' | 'de'>(
      data['language'],
      new Set(['en', 'fr', 'de']),
      'config.language',
    ),
    quietMode: bool(data['quietMode'], 'config.quietMode'),
    autoReturnSeconds: u32(data['autoReturnSeconds'], 'config.autoReturnSeconds', 10, 600),
    gestures: {
      debounceMs: u32(gestures['debounceMs'], 'config.gestures.debounceMs', 10, 200),
      doublePressWindowMs: u32(
        gestures['doublePressWindowMs'],
        'config.gestures.doublePressWindowMs',
        150,
        800,
      ),
      longPressMs: u32(gestures['longPressMs'], 'config.gestures.longPressMs', 800, 3000),
      veryLongPressMs: u32(
        gestures['veryLongPressMs'],
        'config.gestures.veryLongPressMs',
        3000,
        10000,
      ),
    },
    source: enumValue(data['source'], SOURCE_SET, 'config.source'),
  };
}

function validateMcpStatus(data: Obj): McpStatusData {
  onlyKeys(data, ['online', 'total', 'servers', 'source'], 'mcp_status');
  const servers = data['servers'];
  if (!Array.isArray(servers) || servers.length > 8) {
    fail('E_PARSE', 'mcp_status.servers must be an array of at most 8 entries');
  }
  const parsed: McpServerSummary[] = servers.map((entry) => {
    const server = asObj(entry, 'mcp_status.servers[]');
    onlyKeys(server, ['alias', 'status'], 'mcp_status.servers[]');
    return {
      alias: str(server['alias'], 'alias', 12),
      status: enumValue<McpStatus>(server['status'], MCP_SET, 'mcp status'),
    };
  });
  return {
    online: u8(data['online'], 'online'),
    total: u8(data['total'], 'total'),
    servers: parsed,
    source: enumValue<Source>(data['source'], SOURCE_SET, 'mcp_status.source'),
  };
}

function validateAck(data: Obj): AckData {
  onlyKeys(data, ['ack', 'warning'], 'ack');
  const result: AckData = { ack: u32(data['ack'], 'ack.ack', 1) };
  if ('warning' in data) {
    result.warning =
      data['warning'] === null
        ? null
        : enumValue<ErrorCode>(data['warning'], ERROR_SET, 'ack.warning');
  }
  return result;
}

function validateInteraction(data: Obj): InteractionData {
  onlyKeys(data, ['gesture', 'screen'], 'interaction');
  return {
    gesture: enumValue(data['gesture'], GESTURE_SET, 'interaction.gesture'),
    screen: u8(data['screen'], 'interaction.screen', 0, 5),
  };
}

function validateResync(data: Obj): ResyncData {
  onlyKeys(data, ['reason', 'expected', 'received'], 'resync');
  const result: ResyncData = {
    reason: enumValue<ResyncData['reason']>(
      data['reason'],
      new Set(['seq_gap', 'parse_error', 'state_error', 'boot']),
      'resync.reason',
    ),
  };
  if ('expected' in data) result.expected = u32(data['expected'], 'resync.expected');
  if ('received' in data) result.received = u32(data['received'], 'resync.received');
  return result;
}

function validateError(data: Obj): ErrorData {
  onlyKeys(data, ['code', 'fatal', 'detail'], 'error');
  const result: ErrorData = {
    code: enumValue<ErrorCode>(data['code'], ERROR_SET, 'error.code'),
    fatal: bool(data['fatal'], 'error.fatal'),
  };
  if ('detail' in data) result.detail = str(data['detail'], 'error.detail', 48);
  return result;
}

export function validateMessage(value: unknown): ValidationResult {
  try {
    const root = asObj(value, 'message');
    const version = root['v'];
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      fail('E_PARSE', 'v must be an integer');
    }
    if (version !== PROTOCOL_MAJOR) {
      fail('E_VERSION', 'unsupported protocol major');
    }
    const type = root['type'];
    if (typeof type !== 'string') {
      fail('E_PARSE', 'type must be a string');
    }
    const seq = u32(root['seq'], 'seq', 1, 0x7fffffff);
    const base = { v: PROTOCOL_MAJOR as 1, seq } as const;

    if (type === 'heartbeat') {
      if ('data' in root) {
        fail('E_PARSE', 'heartbeat must not carry data');
      }
      return { ok: true, message: { ...base, type: 'heartbeat' } };
    }

    if (!('data' in root)) {
      fail('E_PARSE', 'data is required');
    }
    const data = asObj(root['data'], 'data');

    switch (type) {
      case 'hello':
        return { ok: true, message: { ...base, type: 'hello', data: validateHello(data) } };
      case 'ready':
        return { ok: true, message: { ...base, type: 'ready', data: validateReady(data) } };
      case 'config':
        return { ok: true, message: { ...base, type: 'config', data: validateConfig(data) } };
      case 'state':
        return { ok: true, message: { ...base, type: 'state', data: validateState(data) } };
      case 'mcp_status':
        return {
          ok: true,
          message: { ...base, type: 'mcp_status', data: validateMcpStatus(data) },
        };
      case 'ack':
        return { ok: true, message: { ...base, type: 'ack', data: validateAck(data) } };
      case 'interaction':
        return {
          ok: true,
          message: { ...base, type: 'interaction', data: validateInteraction(data) },
        };
      case 'resync':
        return { ok: true, message: { ...base, type: 'resync', data: validateResync(data) } };
      case 'error':
        return { ok: true, message: { ...base, type: 'error', data: validateError(data) } };
      default:
        fail('E_UNKNOWN_TYPE', `unknown message type ${type}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, code: error.code, detail: error.message };
    }
    return { ok: false, code: 'E_INTERNAL', detail: 'validation failed' };
  }
}

export function validateLine(line: string): ValidationResult {
  if (Buffer.byteLength(line, 'utf8') + 1 > MAX_LINE_BYTES) {
    return { ok: false, code: 'E_TOO_LONG', detail: 'line exceeds 2048 bytes' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, code: 'E_PARSE', detail: 'invalid json' };
  }
  return validateMessage(parsed);
}
