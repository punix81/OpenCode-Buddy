import type { McpStatusData, OpenCodeLink, Source, StateData } from '../protocol/types.js';
import { MetricsManager, type MetricsSnapshot } from '../metrics/metrics.js';
import { newSession, type McpServerState, type NormalizedEvent, type SessionState } from './types.js';
import { reduceState, type ReduceContext } from './reducer.js';

interface McpSnapshot {
  online: number;
  total: number;
  servers: McpServerState[];
}

// A session nobody has touched for this long is not worth remembering; it would
// only grow the registry for the lifetime of the bridge.
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_SESSIONS = 64;
// Absolute ceiling, even when every session has a pending prompt. A misbehaving
// local peer must not grow the registry without bound.
export const HARD_MAX_SESSIONS = 256;
const MAX_INTERACTION_IDS = 64;

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
        // Old MCP values must never look current once OpenCode is gone.
        this.mcp = null;
        return;
      case 'opencode.unknown':
        this.opencode = 'unknown';
        this.mcp = null;
        return;
      case 'mcp.status':
        this.mcp = { online: event.online, total: event.total, servers: event.servers };
        return;
      default:
        break;
    }

    if (event.kind === 'session.closed') {
      this.sessions.delete(event.sessionId);
      this.metrics.removeSession(event.sessionId);
      return;
    }

    const prior = this.sessions.get(event.sessionId);
    // Events carry the source timestamp. A late or reordered transition older
    // than the last known one (or older than a terminal state) must not revive
    // or rewrite the session. execution.started is exempt: a reconnect snapshot
    // restores it from Session.Info.time.busy, which predates the snapshot.
    if (prior !== undefined && event.kind !== 'execution.started') {
      const reference = prior.terminalAt ?? prior.updatedAt;
      if (event.at < reference) return;
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
        if (session.startedAt === null || !isRunning(session.status)) {
          session.startedAt = event.at;
        }
        session.status = event.status;
        session.terminalAt = null;
        return;
      case 'permission.asked': {
        const id = event.requestId;
        if (id !== undefined) {
          if (session.permissionIds.has(id)) return;
          if (session.permissionIds.size >= MAX_INTERACTION_IDS) return;
          session.permissionIds.add(id);
        }
        session.pendingPermissions = Math.min(255, session.pendingPermissions + 1);
        return;
      }
      case 'permission.replied': {
        const id = event.requestId;
        if (id !== undefined) {
          if (!session.permissionIds.delete(id)) return;
        }
        session.pendingPermissions = Math.max(0, session.pendingPermissions - 1);
        return;
      }
      case 'permission.sync': {
        session.permissionIds = new Set(event.requestIds.slice(0, MAX_INTERACTION_IDS));
        session.pendingPermissions = Math.min(255, session.permissionIds.size);
        return;
      }
      case 'question.asked': {
        const id = event.requestId;
        if (id !== undefined) {
          if (session.questionIds.has(id)) return;
          if (session.questionIds.size >= MAX_INTERACTION_IDS) return;
          session.questionIds.add(id);
        }
        session.pendingQuestions = Math.min(255, session.pendingQuestions + 1);
        return;
      }
      case 'question.replied': {
        const id = event.requestId;
        if (id !== undefined) {
          if (!session.questionIds.delete(id)) return;
        }
        session.pendingQuestions = Math.max(0, session.pendingQuestions - 1);
        return;
      }
      case 'retry.scheduled':
        session.status = 'retrying';
        session.retryAttempt = event.attempt;
        session.terminalAt = null;
        return;
      case 'compaction.started':
        session.status = 'compacting';
        session.terminalAt = null;
        return;
      case 'compaction.ended':
        session.status = session.tools.running > 0 ? 'working' : 'idle';
        return;
      case 'tool.started': {
        const changed = this.metrics.recordTool(
          event.sessionId,
          event.messageId,
          event.toolId,
          'started',
          event.category,
        );
        if (changed) {
          session.tools = this.metrics.toolsFor(event.sessionId);
          session.status = 'working';
          session.terminalAt = null;
        }
        return;
      }
      case 'tool.succeeded':
      case 'tool.failed': {
        const outcome = event.kind === 'tool.succeeded' ? 'succeeded' : 'failed';
        // A late outcome without a start must update the counters but never
        // revive an idle/terminal session.
        const hadRunning = session.tools.running > 0;
        const changed = this.metrics.recordTool(
          event.sessionId,
          event.messageId,
          event.toolId,
          outcome,
          event.category,
        );
        if (changed) {
          session.tools = this.metrics.toolsFor(event.sessionId);
          if (hadRunning) {
            session.status = session.tools.running > 0 ? 'working' : 'thinking';
            session.terminalAt = null;
          }
        }
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
        session.tokens = this.metrics.tokensFor(event.sessionId);
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

  private prune(now: number): void {
    for (const [id, session] of this.sessions) {
      if (session.pendingPermissions > 0 || session.pendingQuestions > 0) continue;
      if (now - session.updatedAt <= SESSION_TTL_MS) continue;
      this.sessions.delete(id);
      this.metrics.removeSession(id);
    }
    if (this.sessions.size <= MAX_SESSIONS) return;
    const oldest = [...this.sessions.entries()]
      .filter(([, session]) => session.pendingPermissions === 0 && session.pendingQuestions === 0)
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, this.sessions.size - MAX_SESSIONS);
    for (const [id] of oldest) {
      this.sessions.delete(id);
      this.metrics.removeSession(id);
    }
    if (this.sessions.size <= HARD_MAX_SESSIONS) return;
    const overflow = [...this.sessions.entries()]
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, this.sessions.size - HARD_MAX_SESSIONS);
    for (const [id] of overflow) {
      this.sessions.delete(id);
      this.metrics.removeSession(id);
    }
  }

  list(): SessionState[] {
    return [...this.sessions.values()];
  }

  mcpStatus(source: Source): McpStatusData {
    if (this.mcp === null) {
      return { online: 0, total: 0, servers: [], source };
    }
    return { ...this.mcp, source };
  }

  snapshot(context: ReduceContext): StateData {
    this.prune(context.now);
    return reduceState(this.list(), this.mcpStatus(context.source), this.opencode, context);
  }

  metricsSnapshot(): MetricsSnapshot {
    return this.metrics.snapshot();
  }
}

function isRunning(status: SessionState['status']): boolean {
  return status !== 'idle' && status !== 'success' && status !== 'error' &&
    status !== 'interrupted' && status !== 'offline';
}
