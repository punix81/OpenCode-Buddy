import type { Bridge } from '../bridge.js';
import type { NormalizedEvent } from '../state/types.js';

// Continuous, deterministic pressure for the one-hour soak. One 12-phase cycle
// runs on a single session: execution lifecycle, tools, permission, question,
// retry, compaction, MCP changes and the terminal/idle pair. The next cycle
// moves to the next session, so three sessions stay alive without ever leaving
// an interaction or a running tool behind.
//
// It never claims to be live data: every state carries source "mock".
export const STRESS_SESSIONS = ['stress-1', 'stress-2', 'stress-3'] as const;
const STRESS_MODEL = 'stress-model-40-chars-abcdefghijklmnopqr'; // exactly 40
const STRESS_AGENT = 'stress-agent-24-chars-ab'; // exactly 24

export function stressEvents(step: number, at: number): NormalizedEvent[] {
  const cycle = Math.floor(step / 12);
  const phase = step % 12;
  const sessionId = STRESS_SESSIONS[cycle % STRESS_SESSIONS.length] ?? STRESS_SESSIONS[0];
  const toolA = `tool-a-${cycle}`;
  const toolB = `tool-b-${cycle}`;
  const permissionId = `perm-${cycle}`;
  const formId = `form-${cycle}`;
  const events: NormalizedEvent[] = [];

  switch (phase) {
    case 0:
      events.push({ kind: 'execution.started', sessionId, at });
      events.push({ kind: 'model', sessionId, at, model: STRESS_MODEL, agent: STRESS_AGENT });
      break;
    case 1:
      events.push({ kind: 'phase', sessionId, at, status: 'thinking' });
      break;
    case 2:
      events.push({ kind: 'phase', sessionId, at, status: 'working' });
      events.push({
        kind: 'tool.started',
        sessionId,
        at,
        toolId: toolA,
        messageId: `msg-a-${cycle}`,
        category: 'read',
      });
      break;
    case 3:
      events.push({
        kind: 'tool.succeeded',
        sessionId,
        at,
        toolId: toolA,
        messageId: `msg-a-${cycle}`,
        category: 'read',
      });
      events.push({ kind: 'usage', sessionId, at, input: 1000 + step * 7, output: 500 + step * 3 });
      break;
    case 4:
      events.push({ kind: 'phase', sessionId, at, status: 'generating' });
      events.push({ kind: 'usage', sessionId, at, input: 4000 + step * 11, output: 900 + step * 5 });
      break;
    case 5:
      events.push({ kind: 'permission.asked', sessionId, at, requestId: permissionId });
      break;
    case 6:
      events.push({ kind: 'permission.replied', sessionId, at, requestId: permissionId });
      events.push({
        kind: 'tool.started',
        sessionId,
        at,
        toolId: toolB,
        messageId: `msg-b-${cycle}`,
        category: 'edit',
      });
      break;
    case 7:
      events.push({ kind: 'question.asked', sessionId, at, requestId: formId });
      break;
    case 8:
      events.push({ kind: 'question.replied', sessionId, at, requestId: formId });
      events.push({ kind: 'retry.scheduled', sessionId, at, attempt: 1 + (cycle % 3) });
      break;
    case 9:
      events.push({ kind: 'compaction.started', sessionId, at });
      events.push({
        kind: 'mcp.status',
        at,
        online: cycle % 2,
        total: 2,
        servers: [
          { alias: 'MCP-1', status: cycle % 2 === 0 ? 'connected' : 'needs_auth' },
          { alias: 'MCP-2', status: cycle % 3 === 0 ? 'connected' : 'needs_auth' },
        ],
      });
      break;
    case 10:
      events.push({ kind: 'compaction.ended', sessionId, at });
      events.push({
        kind: 'tool.succeeded',
        sessionId,
        at,
        toolId: toolB,
        messageId: `msg-b-${cycle}`,
        category: 'edit',
      });
      events.push({ kind: 'execution.succeeded', sessionId, at });
      break;
    default:
      events.push({ kind: 'session.idle', sessionId, at });
      // Outcome without a start: exercises the missing-start path without
      // leaving a running tool behind.
      events.push({
        kind: 'tool.failed',
        sessionId,
        at,
        toolId: `tool-x-${cycle}`,
        messageId: `msg-x-${cycle}`,
        category: 'shell',
      });
      break;
  }
  return events;
}

export class StressAdapter {
  private timer: NodeJS.Timeout | null = null;
  private step = 0;
  private stopped = false;

  constructor(
    private readonly bridge: Bridge,
    private readonly intervalMs = 200,
  ) {}

  start(): void {
    for (const sessionId of STRESS_SESSIONS) {
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
    for (const event of stressEvents(this.step, Date.now())) {
      this.bridge.ingest(event);
    }
    ++this.step;
  }
}
