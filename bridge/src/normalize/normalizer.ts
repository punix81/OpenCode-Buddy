import type { McpStatus } from '../protocol/types.js';
import type { McpServerState, NormalizedEvent, ToolCategory } from '../state/types.js';

const SIMPLE_SESSION_KINDS = new Set([
  'session.started',
  'session.idle',
  'session.closed',
  'execution.started',
  'execution.succeeded',
  'execution.failed',
  'execution.interrupted',
  'compaction.started',
  'compaction.ended',
]);

type SimpleSessionKind =
  | 'session.started'
  | 'session.idle'
  | 'session.closed'
  | 'execution.started'
  | 'execution.succeeded'
  | 'execution.failed'
  | 'execution.interrupted'
  | 'compaction.started'
  | 'compaction.ended';

const OPENCODE_KINDS = new Set(['opencode.connected', 'opencode.offline', 'opencode.unknown']);
type OpenCodeKind = 'opencode.connected' | 'opencode.offline' | 'opencode.unknown';

const CATEGORIES = new Set<ToolCategory>(['read', 'edit', 'shell', 'search', 'mcp', 'other']);
const MCP_STATUSES = new Set<McpStatus>(['connected', 'pending', 'disabled', 'failed', 'needs_auth']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error('expected string');
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) {
    throw new Error('invalid string length');
  }
  return cleaned;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error('invalid integer');
  }
  return value;
}

function optionalInteger(value: unknown, min: number, max: number): number | undefined {
  return value === undefined ? undefined : integer(value, min, max);
}

// Default-deny normalization of mock/simulator events. It never accepts a
// prompt, response, code, path, tool argument or shell command: unknown fields
// are dropped and only the explicit projections below survive.
export function normalizeEvent(raw: unknown): NormalizedEvent | null {
  if (!isRecord(raw)) return null;
  const kind = raw['kind'];
  if (typeof kind !== 'string') return null;

  try {
    const at = integer(raw['at'], 0, Number.MAX_SAFE_INTEGER);

    if (SIMPLE_SESSION_KINDS.has(kind)) {
      return { kind: kind as SimpleSessionKind, sessionId: text(raw['sessionId'], 64), at };
    }
    if (OPENCODE_KINDS.has(kind)) {
      return { kind: kind as OpenCodeKind, at };
    }

    switch (kind) {
      case 'phase': {
        const status = raw['status'];
        if (status !== 'thinking' && status !== 'generating' && status !== 'working') return null;
        return { kind: 'phase', sessionId: text(raw['sessionId'], 64), at, status };
      }
      case 'retry.scheduled':
        return {
          kind: 'retry.scheduled',
          sessionId: text(raw['sessionId'], 64),
          at,
          attempt: integer(raw['attempt'], 1, 255),
        };
      case 'tool.started':
      case 'tool.succeeded':
      case 'tool.failed': {
        const category = raw['category'];
        if (!CATEGORIES.has(category as ToolCategory)) return null;
        const messageId = raw['messageId'];
        return {
          kind,
          sessionId: text(raw['sessionId'], 64),
          at,
          toolId: text(raw['toolId'], 64),
          ...(messageId !== undefined ? { messageId: text(messageId, 64) } : {}),
          category: category as ToolCategory,
        };
      }
      case 'usage': {
        const usage: Extract<NormalizedEvent, { kind: 'usage' }> = {
          kind: 'usage',
          sessionId: text(raw['sessionId'], 64),
          at,
        };
        const input = optionalInteger(raw['input'], 0, 0xffffffff);
        const output = optionalInteger(raw['output'], 0, 0xffffffff);
        const total = optionalInteger(raw['total'], 0, 0xffffffff);
        const reasoning = optionalInteger(raw['reasoning'], 0, 0xffffffff);
        const cacheRead = optionalInteger(raw['cacheRead'], 0, 0xffffffff);
        const cacheWrite = optionalInteger(raw['cacheWrite'], 0, 0xffffffff);
        if (input !== undefined) usage.input = input;
        if (output !== undefined) usage.output = output;
        if (total !== undefined) usage.total = total;
        if (reasoning !== undefined) usage.reasoning = reasoning;
        if (cacheRead !== undefined) usage.cacheRead = cacheRead;
        if (cacheWrite !== undefined) usage.cacheWrite = cacheWrite;
        return usage;
      }
      case 'permission.asked':
      case 'permission.replied':
      case 'question.asked':
      case 'question.replied': {
        const requestId = raw['requestId'];
        return {
          kind,
          sessionId: text(raw['sessionId'], 64),
          at,
          ...(requestId !== undefined ? { requestId: text(requestId, 64) } : {}),
        };
      }
      case 'permission.sync': {
        const ids = raw['requestIds'];
        if (!Array.isArray(ids) || ids.length > 64) return null;
        return {
          kind: 'permission.sync',
          sessionId: text(raw['sessionId'], 64),
          at,
          requestIds: ids.map((value) => text(value, 64)),
        };
      }
      case 'model':
        return {
          kind: 'model',
          sessionId: text(raw['sessionId'], 64),
          at,
          model: text(raw['model'], 40),
          agent: text(raw['agent'], 24),
        };
      case 'mcp.status': {
        const servers = raw['servers'];
        if (!Array.isArray(servers) || servers.length > 8) return null;
        const parsed: McpServerState[] = servers.map((entry) => {
          if (!isRecord(entry)) throw new Error('invalid server');
          const status = entry['status'];
          if (!MCP_STATUSES.has(status as McpStatus)) throw new Error('invalid mcp status');
          return { alias: text(entry['alias'], 12), status: status as McpStatus };
        });
        return {
          kind: 'mcp.status',
          at,
          online: integer(raw['online'], 0, 255),
          total: integer(raw['total'], 0, 255),
          servers: parsed,
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
