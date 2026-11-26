export const PROTOCOL_MAJOR = 1 as const;
export const MAX_LINE_BYTES = 2048;

export const STATUSES = [
  'offline',
  'idle',
  'thinking',
  'generating',
  'working',
  'permission_required',
  'user_input_required',
  'success',
  'error',
  'compacting',
  'retrying',
  'interrupted',
] as const;
export type Status = (typeof STATUSES)[number];

export const ERROR_CODES = [
  'E_PARSE',
  'E_TOO_LONG',
  'E_UNKNOWN_TYPE',
  'E_VERSION',
  'E_BOUNDS',
  'E_SERIAL',
  'E_INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type BridgeLink = 'ready' | 'degraded';
export type OpenCodeLink = 'connected' | 'offline' | 'unknown';
export type Source = 'live' | 'mock';
export type McpStatus = 'connected' | 'pending' | 'disabled' | 'failed' | 'needs_auth';
export type GestureName = 'short' | 'double' | 'long' | 'very_long';

export interface Tokens {
  input?: number | null;
  output?: number | null;
  total?: number | null;
  contextPct?: number | null;
}

export interface ToolCategories {
  read?: number;
  edit?: number;
  shell?: number;
  search?: number;
  mcp?: number;
  other?: number;
}

export interface Tools {
  success?: number;
  failed?: number;
  running?: number;
  categories?: ToolCategories;
}

export interface StateData {
  status: Status;
  model?: string | null;
  agent?: string | null;
  activeSessions: number;
  elapsedSeconds?: number;
  pendingPermissions?: number;
  pendingQuestions?: number;
  notifications?: number;
  retryAttempt?: number;
  tokens?: Tokens;
  tools?: Tools;
  mcp?: { online: number; total: number };
  connection: { bridge: BridgeLink; opencode: OpenCodeLink };
  versions: { bridge: string; protocol: number };
  source: Source;
  diagnostic?: { code: ErrorCode };
}

export interface McpServerSummary {
  alias: string;
  status: McpStatus;
}

export interface McpStatusData {
  online: number;
  total: number;
  servers: McpServerSummary[];
  source: Source;
}

export interface HelloData {
  device: 'opencode-buddy';
  fw: string;
  proto: number[];
  maxLine: number;
  boot: number;
  // Optional capabilities. An older firmware sends none: the bridge then keeps
  // sending the legacy config fields it requires.
  caps?: string[];
}

export interface ReadyData {
  bridge: string;
  proto: number;
  run: string;
}

export interface ConfigData {
  // Omitted when the device owns its preference: the host never resets quiet
  // mode or language just by reconnecting.
  language?: 'en' | 'fr' | 'de';
  quietMode?: boolean;
  autoReturnSeconds: number;
  gestures: {
    debounceMs: number;
    doublePressWindowMs: number;
    longPressMs: number;
    veryLongPressMs: number;
  };
  source: Source;
}

export interface AckData {
  ack: number;
  warning?: ErrorCode | null;
}

export interface InteractionData {
  gesture: GestureName;
  screen: number;
}

export interface ResyncData {
  reason: 'seq_gap' | 'parse_error' | 'state_error' | 'boot';
  expected?: number;
  received?: number;
}

export interface ErrorData {
  code: ErrorCode;
  fatal: boolean;
  detail?: string;
}

interface Base<T extends string> {
  v: 1;
  type: T;
  seq: number;
  ts?: number;
  id?: string;
}

export interface HelloMessage extends Base<'hello'> {
  data: HelloData;
}
export interface ReadyMessage extends Base<'ready'> {
  data: ReadyData;
}
export interface ConfigMessage extends Base<'config'> {
  data: ConfigData;
}
export interface StateMessage extends Base<'state'> {
  data: StateData;
}
export interface McpStatusMessage extends Base<'mcp_status'> {
  data: McpStatusData;
}
export interface HeartbeatMessage extends Base<'heartbeat'> {}
export interface AckMessage extends Base<'ack'> {
  data: AckData;
}
export interface InteractionMessage extends Base<'interaction'> {
  data: InteractionData;
}
export interface ResyncMessage extends Base<'resync'> {
  data: ResyncData;
}
export interface ErrorMessage extends Base<'error'> {
  data: ErrorData;
}

export type AnyMessage =
  | HelloMessage
  | ReadyMessage
  | ConfigMessage
  | StateMessage
  | McpStatusMessage
  | HeartbeatMessage
  | AckMessage
  | InteractionMessage
  | ResyncMessage
  | ErrorMessage;

export type MessageType = AnyMessage['type'];
