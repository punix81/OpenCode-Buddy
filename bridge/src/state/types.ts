import type { McpStatus, Status } from '../protocol/types.js';

export type ToolCategory = 'read' | 'edit' | 'shell' | 'search' | 'mcp' | 'other';

// Unknown counters stay null: a session that never reported output must not be
// displayed as "0 output".
export interface TokenUsage {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  available: boolean;
}

export interface ToolCounters {
  success: number;
  failed: number;
  running: number;
  categories: Record<ToolCategory, number>;
}

// Interaction states are derived, never stored: an execution keeps its own
// activity so a pending permission cannot be erased by a later phase event.
export type ActivityStatus = Exclude<Status, 'permission_required' | 'user_input_required'>;

export interface SessionState {
  id: string;
  status: ActivityStatus;
  model: string | null;
  agent: string | null;
  startedAt: number | null;
  updatedAt: number;
  terminalAt: number | null;
  pendingPermissions: number;
  pendingQuestions: number;
  permissionIds: Set<string>;
  questionIds: Set<string>;
  retryAttempt: number;
  tokens: TokenUsage;
  tools: ToolCounters;
}

export interface McpServerState {
  alias: string;
  status: McpStatus;
}

export type NormalizedEvent =
  | { kind: 'session.started'; sessionId: string; at: number }
  | { kind: 'session.idle'; sessionId: string; at: number }
  | { kind: 'session.closed'; sessionId: string; at: number }
  | { kind: 'execution.started'; sessionId: string; at: number }
  | { kind: 'execution.succeeded'; sessionId: string; at: number }
  | { kind: 'execution.failed'; sessionId: string; at: number }
  | { kind: 'execution.interrupted'; sessionId: string; at: number }
  | { kind: 'phase'; sessionId: string; at: number; status: 'thinking' | 'generating' | 'working' }
  | { kind: 'permission.asked'; sessionId: string; at: number; requestId?: string }
  | { kind: 'permission.replied'; sessionId: string; at: number; requestId?: string }
  | { kind: 'permission.sync'; sessionId: string; at: number; requestIds: string[] }
  | { kind: 'question.asked'; sessionId: string; at: number; requestId?: string }
  | { kind: 'question.replied'; sessionId: string; at: number; requestId?: string }
  | { kind: 'retry.scheduled'; sessionId: string; at: number; attempt: number }
  | { kind: 'compaction.started'; sessionId: string; at: number }
  | { kind: 'compaction.ended'; sessionId: string; at: number }
  | {
      kind: 'tool.started' | 'tool.succeeded' | 'tool.failed';
      sessionId: string;
      at: number;
      toolId: string;
      messageId?: string;
      category: ToolCategory;
    }
  | {
      kind: 'usage';
      sessionId: string;
      at: number;
      input?: number;
      output?: number;
      total?: number;
      reasoning?: number;
      cacheRead?: number;
      cacheWrite?: number;
    }
  | { kind: 'model'; sessionId: string; at: number; model: string; agent: string }
  | { kind: 'mcp.status'; at: number; online: number; total: number; servers: McpServerState[] }
  | { kind: 'opencode.connected'; at: number }
  | { kind: 'opencode.offline'; at: number }
  | { kind: 'opencode.unknown'; at: number };

export function emptyTokens(): TokenUsage {
  return {
    input: null,
    output: null,
    reasoning: null,
    cacheRead: null,
    cacheWrite: null,
    available: false,
  };
}

export function emptyTools(): ToolCounters {
  return {
    success: 0,
    failed: 0,
    running: 0,
    categories: { read: 0, edit: 0, shell: 0, search: 0, mcp: 0, other: 0 },
  };
}

export function newSession(id: string, at: number): SessionState {
  return {
    id,
    status: 'idle',
    model: null,
    agent: null,
    startedAt: null,
    updatedAt: at,
    terminalAt: null,
    pendingPermissions: 0,
    pendingQuestions: 0,
    permissionIds: new Set<string>(),
    questionIds: new Set<string>(),
    retryAttempt: 0,
    tokens: emptyTokens(),
    tools: emptyTools(),
  };
}
