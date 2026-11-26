import type { McpStatusData, OpenCodeLink, StateData } from '../protocol/types.js';
import { MetricsManager, type MetricsSnapshot } from '../metrics/metrics.js';
import { newSession, type McpServerState, type NormalizedEvent, type SessionState } from './types.js';
import { isActive, reduceState, type ReduceContext } from './reducer.js';

interface McpSnapshot {
  online: number;
  total: number;
  servers: McpServerState[];
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionState>();
  private readonly metrics = new MetricsManager();
  private mcp: McpSnapshot | null = null;
  private opencode: OpenCodeLink = 'unknown';

  private ensure(sessionId: string, at: number): SessionState {
    let session = this.sessions.get(sessionId);
    if (session === undefined) {
      session = newSession(sessionId, at);
      this.sessions.set(sessionId, session);
    }
    session.updatedAt = at;
    return session;
  }

  apply(event: NormalizedEvent): void {
    switch (event.kind) {
      case 'opencode.connected':
        this.opencode = 'connected';
        return;
      case 'opencode.offline':
        this.opencode = 'offline';
        return;
      case 'opencode.unknown':
        this.opencode = 'unknown';
        return;
      case 'mcp.status':
        this.mcp = {
          online: event.online,
          total: event.total,
          servers: event.servers,
        };
        return;
      default:
        break;
    }

    if (event.kind === 'session.closed') {
      this.sessions.delete(event.sessionId);
      this.metrics.removeSession(event.sessionId);
      return;
    }

    const session = this.ensure(event.sessionId, event.at);

    switch (event.kind) {
      case 'session.started':
        session.status = 'idle';
        session.terminalAt = null;
        return;
      case 'session.idle':
        session.status = 'idle';
        session.terminalAt = null;
        session.retryAttempt = 0;
        return;
      case 'execution.started':
        session.status = 'thinking';
        session.startedAt = event.at;
        session.terminalAt = null;
        session.retryAttempt = 0;
        return;
      case 'execution.succeeded':
        session.status = 'success';
        session.terminalAt = event.at;
        return;
      case 'execution.failed':
        session.status = 'error';
        session.terminalAt = event.at;
        return;
      case 'execution.interrupted':
        session.status = 'interrupted';
        session.terminalAt = event.at;
        return;
      case 'phase':
        // A phase can be the first trace of an execution seen by this bridge
        // (attach mid-run, missed execution.started). Start the chronometer from
        // that first trace instead of leaving it at zero; a phase that arrives
        // while the session is already running keeps the original start.
        if (session.startedAt === null || !isActive(session.status)) {
          session.startedAt = event.at;
        }
        session.status = event.status;
        session.terminalAt = null;
        return;
      case 'permission.asked':
        session.pendingPermissions = Math.min(255, session.pendingPermissions + 1);
        session.status = 'permission_required';
        return;
      case 'permission.replied':
        session.pendingPermissions = Math.max(0, session.pendingPermissions - 1);
        if (session.pendingPermissions === 0 && session.status === 'permission_required') {
          session.status = 'idle';
        }
        return;
      case 'question.asked':
        session.pendingQuestions = Math.min(255, session.pendingQuestions + 1);
        session.status = 'user_input_required';
        return;
      case 'question.replied':
        session.pendingQuestions = Math.max(0, session.pendingQuestions - 1);
        if (session.pendingQuestions === 0 && session.status === 'user_input_required') {
          session.status = 'idle';
        }
        return;
      case 'retry.scheduled':
        session.status = 'retrying';
        session.retryAttempt = event.attempt;
        return;
      case 'compaction.started':
        session.status = 'compacting';
        return;
      case 'compaction.ended':
        session.status = session.tools.running > 0 ? 'working' : 'idle';
        return;
      case 'tool.started':
        session.status = 'working';
        if (this.metrics.recordTool(event.sessionId, event.messageId, event.toolId, 'started', event.category)) {
          session.tools.running = Math.min(255, session.tools.running + 1);
        }
        return;
      case 'tool.succeeded':
      case 'tool.failed': {
        const outcome = event.kind === 'tool.succeeded' ? 'succeeded' : 'failed';
        if (this.metrics.recordTool(event.sessionId, event.messageId, event.toolId, outcome, event.category)) {
          if (session.tools.running > 0) {
            --session.tools.running;
          }
          if (outcome === 'succeeded') {
            ++session.tools.success;
          } else {
            ++session.tools.failed;
          }
          session.tools.categories[event.category] =
            session.tools.categories[event.category] + 1;
        }
        session.status = session.tools.running > 0 ? 'working' : 'thinking';
        return;
      }
      case 'usage': {
        this.metrics.recordUsage(event.sessionId, {
          ...(event.input !== undefined ? { input: event.input } : {}),
          ...(event.output !== undefined ? { output: event.output } : {}),
          ...(event.reasoning !== undefined ? { reasoning: event.reasoning } : {}),
          ...(event.cacheRead !== undefined ? { cacheRead: event.cacheRead } : {}),
          ...(event.cacheWrite !== undefined ? { cacheWrite: event.cacheWrite } : {}),
        });
        return;
      }
      case 'model':
        session.model = event.model;
        session.agent = event.agent;
        return;
      default:
        return;
    }
  }

  list(): SessionState[] {
    return [...this.sessions.values()];
  }

  mcpStatus(source: 'live' | 'mock'): McpStatusData {
    if (this.mcp === null) {
      return { online: 0, total: 0, servers: [], source };
    }
    return { ...this.mcp, source };
  }

  snapshot(context: ReduceContext): StateData {
    return reduceState(this.list(), this.metrics.snapshot(), this.mcpStatus(context.source), this.opencode, context);
  }

  metricsSnapshot(): MetricsSnapshot {
    return this.metrics.snapshot();
  }
}
