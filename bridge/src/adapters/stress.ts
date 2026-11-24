import type { Bridge } from '../bridge.js';
import type { NormalizedEvent } from '../state/types.js';

// Continuous, deterministic pressure for the one-hour soak. It rotates through
// every state, keeps three sessions alive, toggles permissions and questions,
// changes MCP availability, updates metrics on every tick and uses the longest
// legal model and agent names so the outbound snapshot stays near its maximum
// size. It never claims to be live data: every state carries source "mock".
export class StressAdapter {
  private timer: NodeJS.Timeout | null = null;
  private step = 0;
  private stopped = false;

  constructor(
    private readonly bridge: Bridge,
    private readonly intervalMs = 200,
  ) {}

  start(): void {
    const sessions: [string, string, string] = ['stress-1', 'stress-2', 'stress-3'];
    for (const sessionId of sessions) {
      this.bridge.ingest({ kind: 'session.started', sessionId, at: Date.now() });
    }
    this.bridge.ingest({ kind: 'opencode.connected', at: Date.now() });
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.stopped) return;
    const at = Date.now();
    const sessionIndex = this.step % 3;
    const sessionId: string =
      sessionIndex === 0 ? 'stress-1' : sessionIndex === 1 ? 'stress-2' : 'stress-3';
    const phase = this.step % 12;
    const emit = (event: NormalizedEvent): void => {
      this.bridge.ingest(event);
    };

    switch (phase) {
      case 0:
        emit({ kind: 'execution.started', sessionId, at });
        emit({ kind: 'model', sessionId, at, model: 'stress-model-name-at-forty-chars-abcdefghij', agent: 'stress-agent-24-chars-ab' });
        break;
      case 1:
        emit({ kind: 'phase', sessionId, at, status: 'thinking' });
        break;
      case 2:
        emit({ kind: 'phase', sessionId, at, status: 'working' });
        emit({ kind: 'tool.started', sessionId, at, toolId: `tool-${this.step}`, messageId: `msg-${this.step}`, category: 'read' });
        break;
      case 3:
        emit({ kind: 'tool.succeeded', sessionId, at, toolId: `tool-${this.step - 1}`, messageId: `msg-${this.step - 1}`, category: 'read' });
        emit({ kind: 'usage', sessionId, at, input: 1000 + this.step * 7, output: 500 + this.step * 3 });
        break;
      case 4:
        emit({ kind: 'phase', sessionId, at, status: 'generating' });
        emit({ kind: 'usage', sessionId, at, input: 4000 + this.step * 11, output: 900 + this.step * 5 });
        break;
      case 5:
        emit({ kind: 'permission.asked', sessionId, at });
        break;
      case 6:
        emit({ kind: 'permission.replied', sessionId, at });
        emit({ kind: 'tool.started', sessionId, at, toolId: `tool-${this.step}`, messageId: `msg-${this.step}`, category: 'edit' });
        break;
      case 7:
        emit({ kind: 'question.asked', sessionId, at });
        break;
      case 8:
        emit({ kind: 'question.replied', sessionId, at });
        emit({ kind: 'retry.scheduled', sessionId, at, attempt: 1 + (this.step % 3) });
        break;
      case 9:
        emit({ kind: 'compaction.started', sessionId, at });
        emit({
          kind: 'mcp.status',
          at,
          online: this.step % 3,
          total: 2,
          servers: [
            { alias: 'MCP-1', status: this.step % 2 === 0 ? 'connected' : 'needs_auth' },
            { alias: 'MCP-2', status: this.step % 3 === 0 ? 'connected' : 'needs_auth' },
          ],
        });
        break;
      case 10:
        emit({ kind: 'compaction.ended', sessionId, at });
        emit({ kind: 'execution.succeeded', sessionId, at });
        break;
      default:
        emit({ kind: 'session.idle', sessionId, at });
        emit({ kind: 'tool.failed', sessionId, at, toolId: `tool-${this.step}`, messageId: `msg-${this.step}`, category: 'shell' });
        break;
    }
    ++this.step;
  }
}
