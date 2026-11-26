import { emptyTokens, emptyTools, type TokenUsage, type ToolCategory, type ToolCounters } from '../state/types.js';

export interface TokenSummary {
  input: number | null;
  output: number | null;
  total: number | null;
  available: boolean;
}

export interface MetricsSnapshot {
  tokens: TokenSummary;
  tools: ToolCounters;
}

interface ToolCall {
  status: 'running' | 'succeeded' | 'failed';
  category: ToolCategory;
}

interface SessionMetrics {
  usage: TokenUsage;
  calls: Map<string, ToolCall>;
  tools: ToolCounters;
}

// Per-call entries kept for one session. Only completed calls are evicted, so a
// running tool can never disappear from the count; a runaway number of running
// calls is impossible in practice and stays bounded by the map itself.
const MAX_CALLS_PER_SESSION = 512;

function emptyCounters(): ToolCounters {
  return emptyTools();
}

function mergeKnown(
  current: number | null,
  next: number | undefined,
): number | null {
  if (next === undefined) return current;
  if (current === null) return next;
  return Math.max(current, next);
}

export function tokenSummary(tokens: TokenUsage): TokenSummary {
  const available = tokens.available;
  const input = tokens.input;
  const output = tokens.output;
  return {
    input,
    output,
    total: input !== null && output !== null ? input + output : null,
    available,
  };
}

// Deduplicates tool calls and keeps cumulative token usage per session. Token
// usage keeps the maximum cumulative value per session, never a sum of deltas;
// an unknown counter stays null instead of becoming zero.
export class MetricsManager {
  private readonly sessions = new Map<string, SessionMetrics>();

  private ensure(sessionId: string): SessionMetrics {
    let session = this.sessions.get(sessionId);
    if (session === undefined) {
      session = { usage: emptyTokens(), calls: new Map(), tools: emptyCounters() };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private evict(session: SessionMetrics): void {
    if (session.calls.size < MAX_CALLS_PER_SESSION) return;
    for (const [key, call] of session.calls) {
      if (session.calls.size < MAX_CALLS_PER_SESSION) break;
      if (call.status !== 'running') session.calls.delete(key);
    }
  }

  recordTool(
    sessionId: string,
    messageId: string | undefined,
    toolId: string,
    outcome: 'started' | 'succeeded' | 'failed',
    category: ToolCategory,
  ): boolean {
    const session = this.ensure(sessionId);
    const key = `${messageId ?? ''}|${toolId}`;
    const existing = session.calls.get(key);

    if (outcome === 'started') {
      if (existing !== undefined) return false;
      this.evict(session);
      if (session.calls.size >= MAX_CALLS_PER_SESSION) return false;
      session.calls.set(key, { status: 'running', category });
      ++session.tools.running;
      return true;
    }

    if (existing !== undefined) {
      if (existing.status !== 'running') return false;
      --session.tools.running;
    }
    const status = outcome === 'succeeded' ? 'succeeded' : 'failed';
    if (existing === undefined) {
      this.evict(session);
      if (session.calls.size >= MAX_CALLS_PER_SESSION) return false;
    }
    session.calls.set(key, { status, category });
    if (status === 'succeeded') {
      ++session.tools.success;
    } else {
      ++session.tools.failed;
    }
    session.tools.categories[category] = session.tools.categories[category] + 1;
    return true;
  }

  recordUsage(
    sessionId: string,
    values: {
      input?: number;
      output?: number;
      total?: number;
      reasoning?: number;
      cacheRead?: number;
      cacheWrite?: number;
    },
  ): void {
    const session = this.ensure(sessionId);
    session.usage = {
      input: mergeKnown(session.usage.input, values.input),
      output: mergeKnown(session.usage.output, values.output),
      reasoning: mergeKnown(session.usage.reasoning, values.reasoning),
      cacheRead: mergeKnown(session.usage.cacheRead, values.cacheRead),
      cacheWrite: mergeKnown(session.usage.cacheWrite, values.cacheWrite),
      available:
        session.usage.available ||
        values.input !== undefined ||
        values.output !== undefined ||
        values.reasoning !== undefined ||
        values.cacheRead !== undefined ||
        values.cacheWrite !== undefined,
    };
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  tokensFor(sessionId: string): TokenUsage {
    return this.sessions.get(sessionId)?.usage ?? emptyTokens();
  }

  toolsFor(sessionId: string): ToolCounters {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return emptyCounters();
    return {
      ...session.tools,
      categories: { ...session.tools.categories },
    };
  }

  // Global view, kept for diagnostics and soak statistics. The device receives
  // the focus session's metrics, not this aggregate.
  snapshot(): MetricsSnapshot {
    let input: number | null = null;
    let output: number | null = null;
    let available = false;
    const tools = emptyCounters();
    for (const session of this.sessions.values()) {
      if (session.usage.input !== null) {
        input = (input ?? 0) + session.usage.input;
      }
      if (session.usage.output !== null) {
        output = (output ?? 0) + session.usage.output;
      }
      available = available || session.usage.available;
      tools.success += session.tools.success;
      tools.failed += session.tools.failed;
      tools.running += session.tools.running;
      for (const category of Object.keys(tools.categories) as ToolCategory[]) {
        tools.categories[category] += session.tools.categories[category];
      }
    }
    return {
      tokens: {
        input,
        output,
        total: input !== null && output !== null ? input + output : null,
        available,
      },
      tools,
    };
  }
}
