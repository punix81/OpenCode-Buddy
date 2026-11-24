import type { McpStatus, Status } from '../protocol/types.js';

export type ToolCategory = 'read' | 'edit' | 'shell' | 'search' | 'mcp' | 'other';

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  available: boolean;
}

export interface ToolCounters {
  success: number;
  failed: number;
  running: number;
  categories: Record<ToolCategory, number>;
}

export interface SessionState {
  id: string;
  status: Status;
  model: string | null;
  agent: string | null;
  startedAt: number | null;
  updatedAt: number;
  terminalAt: number | null;
  pendingPermissions: number;
  pendingQuestions: number;
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
  | { kind: 'permission.asked'; sessionId: string; at: number }
  | { kind: 'permission.replied'; sessionId: string; at: number }
  | { kind: 'question.asked'; sessionId: string; at: number }
  | { kind: 'question.replied'; sessionId: string; at: number }
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
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, available: false };
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
    retryAttempt: 0,
    tokens: emptyTokens(),
    tools: emptyTools(),
  };
}
