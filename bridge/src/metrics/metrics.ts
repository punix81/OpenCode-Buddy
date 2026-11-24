import { emptyTokens, type TokenUsage, type ToolCategory, type ToolCounters } from '../state/types.js';

export interface MetricsSnapshot {
  tokens: { input: number | null; output: number | null; total: number | null; available: boolean };
  tools: ToolCounters;
}

// Deduplicates tool calls and keeps cumulative token usage per session. A tool
// is counted once per (session, message, tool, outcome); token usage keeps the
// maximum cumulative value per session, never a sum of deltas.
export class MetricsManager {
  private readonly seenTools = new Set<string>();
  private readonly usage = new Map<string, TokenUsage>();
  private readonly tools: ToolCounters = {
    success: 0,
    failed: 0,
    running: 0,
    categories: { read: 0, edit: 0, shell: 0, search: 0, mcp: 0, other: 0 },
  };

  recordTool(
    sessionId: string,
    messageId: string | undefined,
    toolId: string,
    outcome: 'started' | 'succeeded' | 'failed',
    category: ToolCategory,
  ): boolean {
    const key = `${sessionId}|${messageId ?? ''}|${toolId}|${outcome}`;
    if (this.seenTools.has(key)) {
      return false;
    }
    this.seenTools.add(key);
    if (this.seenTools.size > 8192) {
      this.seenTools.clear();
    }

    if (outcome === 'started') {
      ++this.tools.running;
      return true;
    }
    if (this.tools.running > 0) {
      --this.tools.running;
    }
    if (outcome === 'succeeded') {
      ++this.tools.success;
    } else {
      ++this.tools.failed;
    }
    this.tools.categories[category] = this.tools.categories[category] + 1;
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
    const current = this.usage.get(sessionId) ?? emptyTokens();
    const next: TokenUsage = {
      input: Math.max(current.input, values.input ?? 0),
      output: Math.max(current.output, values.output ?? 0),
      reasoning: Math.max(current.reasoning, values.reasoning ?? 0),
      cacheRead: Math.max(current.cacheRead, values.cacheRead ?? 0),
      cacheWrite: Math.max(current.cacheWrite, values.cacheWrite ?? 0),
      available: true,
    };
    this.usage.set(sessionId, next);
  }

  removeSession(sessionId: string): void {
    this.usage.delete(sessionId);
  }

  snapshot(): MetricsSnapshot {
    let input = 0;
    let output = 0;
    let available = false;
    for (const value of this.usage.values()) {
      if (!value.available) continue;
      available = true;
      input += value.input;
      output += value.output;
    }
    return {
      tokens: {
        input: available ? input : null,
        output: available ? output : null,
        total: available ? input + output : null,
        available,
      },
      tools: {
        success: this.tools.success,
        failed: this.tools.failed,
        running: this.tools.running,
        categories: { ...this.tools.categories },
      },
    };
  }
}
