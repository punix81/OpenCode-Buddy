import type { McpStatus } from '../protocol/types.js';

export const IPC_VERSION = 1 as const;
export const IPC_MAX_LINE_BYTES = 8192;
export const IPC_MAX_SERVERS = 16;
// NDJSON v1 carries at most eight server entries (privacy.projectMcp slices to 8
// and the firmware radar draws eight). Totals may be larger.
export const IPC_MAX_DETAIL = 8;
export const IPC_ALIAS_MAX = 12;

const MCP_STATUSES: readonly McpStatus[] = ['connected', 'pending', 'disabled', 'failed', 'needs_auth'];

export interface IpcHello {
  pid: number | null;
  app: string;
  appVersion: string;
  plugin: string;
  pluginVersion: string;
}

export type IpcMessage =
  | { type: 'hello'; token: string; hello: IpcHello }
  | { type: 'event'; raw: Record<string, unknown> }
  | { type: 'heartbeat'; at: number }
  | { type: 'source'; status: 'ok' | 'degraded'; at: number };

export interface LiveNormalizeOptions {
  allowRealMcpNames: boolean;
  aliasFor: (name: string) => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) return null;
  return cleaned;
}

function timestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : Date.now();
}

// The plugin knows real MCP server names, the device only receives aliases: the
// projection happens here, before the registry, so a real name can never reach
// the USB protocol when allowRealMcpNames is false.
export function normalizeMcpStatus(raw: Record<string, unknown>, options: LiveNormalizeOptions): unknown {
  const servers = raw['servers'];
  if (!Array.isArray(servers) || servers.length > IPC_MAX_SERVERS) return null;

  const parsed: { alias: string; status: McpStatus }[] = [];
  for (const entry of servers) {
    if (!isRecord(entry)) return null;
    const name = boundedString(entry['name'], 64);
    const status = entry['status'];
    if (name === null || typeof status !== 'string') return null;
    if (!(MCP_STATUSES as readonly string[]).includes(status)) return null;
    const alias = options.allowRealMcpNames ? name : options.aliasFor(name);
    parsed.push({ alias: alias.slice(0, IPC_ALIAS_MAX), status: status as McpStatus });
  }

  const connectedCount = parsed.filter((entry) => entry.status === 'connected').length;
  // The plugin sees the complete list and declares the real totals; the detail
  // array is capped for the protocol. Recompute only when the totals are absent
  // (older plugin), and never let a declared total contradict the details.
  const declaredOnline = raw['online'];
  const declaredTotal = raw['total'];
  const online =
    typeof declaredOnline === 'number' && Number.isInteger(declaredOnline) && declaredOnline >= 0
      ? Math.min(declaredOnline, 255)
      : connectedCount;
  const total =
    typeof declaredTotal === 'number' && Number.isInteger(declaredTotal) && declaredTotal >= 0
      ? Math.min(declaredTotal, 255)
      : parsed.length;
  if (total < parsed.length || online > total) return null;

  const detail = [
    ...parsed.filter((entry) => entry.status === 'connected'),
    ...parsed.filter((entry) => entry.status !== 'connected'),
  ].slice(0, IPC_MAX_DETAIL);
  return {
    kind: 'mcp.status',
    at: timestamp(raw['at']),
    online,
    total,
    servers: detail,
  };
}

export type ParsedLine =
  | { ok: true; message: IpcMessage }
  | { ok: false; reason: 'json' | 'shape' | 'version' };

export function parseIpcLine(line: string): ParsedLine {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isRecord(value)) return { ok: false, reason: 'shape' };
  if (value['v'] !== IPC_VERSION) return { ok: false, reason: 'version' };

  switch (value['type']) {
    case 'hello': {
      const token = boundedString(value['token'], 128);
      if (token === null) return { ok: false, reason: 'shape' };
      const pid = value['pid'];
      return {
        ok: true,
        message: {
          type: 'hello',
          token,
          hello: {
            pid: typeof pid === 'number' && Number.isInteger(pid) && pid > 0 ? pid : null,
            app: boundedString(value['app'], 24) ?? 'unknown',
            appVersion: boundedString(value['appVersion'], 24) ?? '--',
            plugin: boundedString(value['plugin'], 32) ?? 'unknown',
            pluginVersion: boundedString(value['pluginVersion'], 16) ?? '--',
          },
        },
      };
    }
    case 'event': {
      const event = value['event'];
      if (!isRecord(event) || typeof event['kind'] !== 'string') {
        return { ok: false, reason: 'shape' };
      }
      return { ok: true, message: { type: 'event', raw: event } };
    }
    case 'heartbeat':
      return { ok: true, message: { type: 'heartbeat', at: timestamp(value['at']) } };
    case 'source': {
      const status = value['status'];
      if (status !== 'ok' && status !== 'degraded') return { ok: false, reason: 'shape' };
      return { ok: true, message: { type: 'source', status, at: timestamp(value['at']) } };
    }
    default:
      return { ok: false, reason: 'shape' };
  }
}
