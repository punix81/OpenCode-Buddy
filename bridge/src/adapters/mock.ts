import type { Bridge } from '../bridge.js';
import type { NormalizedEvent } from '../state/types.js';

export type ScenarioName = 'full-session' | 'permission' | 'multi-session' | 'error' | 'all-states';

export interface ScenarioStep {
  delayMs: number;
  make: (at: number) => NormalizedEvent;
}

const tool = (
  kind: 'tool.started' | 'tool.succeeded' | 'tool.failed',
  sessionId: string,
  toolId: string,
  category: 'read' | 'edit' | 'shell' | 'search' | 'mcp' | 'other',
): ((at: number) => NormalizedEvent) => (at) => ({
  kind,
  sessionId,
  at,
  toolId,
  messageId: `msg-${toolId}`,
  category,
});

export function scenarioSteps(name: ScenarioName): ScenarioStep[] {
  const s = 'mock-1';
  const s2 = 'mock-2';
  switch (name) {
    case 'full-session':
      return [
        { delayMs: 0, make: (at) => ({ kind: 'opencode.connected', at }) },
        { delayMs: 100, make: (at) => ({ kind: 'session.started', sessionId: s, at }) },
        { delayMs: 250, make: (at) => ({ kind: 'execution.started', sessionId: s, at }) },
        { delayMs: 500, make: (at) => ({ kind: 'model', sessionId: s, at, model: 'mock-model', agent: 'build' }) },
        { delayMs: 700, make: (at) => ({ kind: 'phase', sessionId: s, at, status: 'thinking' }) },
        { delayMs: 1400, make: (at) => ({ kind: 'usage', sessionId: s, at, input: 1200, output: 0 }) },
        { delayMs: 1600, make: (at) => tool('tool.started', s, 'read-1', 'read')(at) },
        { delayMs: 2400, make: (at) => tool('tool.succeeded', s, 'read-1', 'read')(at) },
        { delayMs: 2600, make: (at) => ({ kind: 'phase', sessionId: s, at, status: 'generating' }) },
        { delayMs: 3400, make: (at) => ({ kind: 'usage', sessionId: s, at, input: 3200, output: 900 }) },
        { delayMs: 4200, make: (at) => ({ kind: 'execution.succeeded', sessionId: s, at }) },
        { delayMs: 8000, make: (at) => ({ kind: 'session.idle', sessionId: s, at }) },
      ];
    case 'permission':
      return [
        { delayMs: 0, make: (at) => ({ kind: 'session.started', sessionId: s, at }) },
        { delayMs: 150, make: (at) => ({ kind: 'execution.started', sessionId: s, at }) },
        { delayMs: 400, make: (at) => ({ kind: 'model', sessionId: s, at, model: 'mock-model', agent: 'build' }) },
        { delayMs: 900, make: (at) => tool('tool.started', s, 'edit-1', 'edit')(at) },
        { delayMs: 1400, make: (at) => ({ kind: 'permission.asked', sessionId: s, at }) },
        { delayMs: 5000, make: (at) => ({ kind: 'permission.replied', sessionId: s, at }) },
        { delayMs: 5200, make: (at) => tool('tool.succeeded', s, 'edit-1', 'edit')(at) },
        { delayMs: 6000, make: (at) => ({ kind: 'execution.succeeded', sessionId: s, at }) },
      ];
    case 'multi-session':
      return [
        { delayMs: 0, make: (at) => ({ kind: 'session.started', sessionId: s, at }) },
        { delayMs: 100, make: (at) => ({ kind: 'session.started', sessionId: s2, at }) },
        { delayMs: 200, make: (at) => ({ kind: 'execution.started', sessionId: s, at }) },
        { delayMs: 300, make: (at) => ({ kind: 'execution.started', sessionId: s2, at }) },
        { delayMs: 500, make: (at) => ({ kind: 'phase', sessionId: s, at, status: 'thinking' }) },
        { delayMs: 700, make: (at) => tool('tool.started', s2, 'shell-1', 'shell')(at) },
        { delayMs: 1600, make: (at) => ({ kind: 'permission.asked', sessionId: s2, at }) },
        { delayMs: 2400, make: (at) => ({ kind: 'usage', sessionId: s, at, input: 800, output: 100 }) },
        { delayMs: 3200, make: (at) => ({ kind: 'usage', sessionId: s2, at, input: 1500, output: 300 }) },
      ];
    case 'error':
      return [
        { delayMs: 0, make: (at) => ({ kind: 'session.started', sessionId: s, at }) },
        { delayMs: 150, make: (at) => ({ kind: 'execution.started', sessionId: s, at }) },
        { delayMs: 500, make: (at) => tool('tool.started', s, 'shell-1', 'shell')(at) },
        { delayMs: 900, make: (at) => tool('tool.failed', s, 'shell-1', 'shell')(at) },
        { delayMs: 1200, make: (at) => ({ kind: 'execution.failed', sessionId: s, at }) },
      ];
    case 'all-states':
      return [
        { delayMs: 0, make: (at) => ({ kind: 'session.started', sessionId: s, at }) },
        { delayMs: 100, make: (at) => ({ kind: 'execution.started', sessionId: s, at }) },
        { delayMs: 600, make: (at) => ({ kind: 'phase', sessionId: s, at, status: 'thinking' }) },
        { delayMs: 1600, make: (at) => ({ kind: 'phase', sessionId: s, at, status: 'generating' }) },
        { delayMs: 2600, make: (at) => tool('tool.started', s, 'read-1', 'read')(at) },
        { delayMs: 3600, make: (at) => tool('tool.succeeded', s, 'read-1', 'read')(at) },
        { delayMs: 4600, make: (at) => ({ kind: 'permission.asked', sessionId: s, at }) },
        { delayMs: 6200, make: (at) => ({ kind: 'permission.replied', sessionId: s, at }) },
        { delayMs: 7200, make: (at) => ({ kind: 'question.asked', sessionId: s, at }) },
        { delayMs: 8600, make: (at) => ({ kind: 'question.replied', sessionId: s, at }) },
        { delayMs: 9600, make: (at) => ({ kind: 'retry.scheduled', sessionId: s, at, attempt: 2 }) },
        { delayMs: 11000, make: (at) => ({ kind: 'compaction.started', sessionId: s, at }) },
        { delayMs: 12200, make: (at) => ({ kind: 'compaction.ended', sessionId: s, at }) },
        { delayMs: 13600, make: (at) => ({ kind: 'execution.succeeded', sessionId: s, at }) },
        { delayMs: 15200, make: (at) => ({ kind: 'execution.interrupted', sessionId: s, at }) },
        { delayMs: 16800, make: (at) => ({ kind: 'session.idle', sessionId: s, at }) },
      ];
  }
}

export class MockAdapter {
  private timers: NodeJS.Timeout[] = [];
  private stopped = false;

  constructor(
    private readonly bridge: Bridge,
    private readonly scenario: ScenarioName = 'full-session',
  ) {}

  start(): void {
    this.bridge.ingest({ kind: 'mcp.status', at: Date.now(), online: 1, total: 2, servers: [
      { alias: 'MCP-1', status: 'connected' },
      { alias: 'MCP-2', status: 'needs_auth' },
    ] });
    for (const step of scenarioSteps(this.scenario)) {
      const timer = setTimeout(() => {
        if (!this.stopped) {
          this.bridge.ingest(step.make(Date.now()));
        }
      }, step.delayMs);
      this.timers.push(timer);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}
