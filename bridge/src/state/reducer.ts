import type { BridgeLink, McpStatusData, OpenCodeLink, Source, StateData, Status } from '../protocol/types.js';
import type { MetricsSnapshot } from '../metrics/metrics.js';
import type { SessionState } from './types.js';

export const SUCCESS_TTL_MS = 4000;
export const ERROR_TTL_MS = 30000;
export const INTERRUPTED_TTL_MS = 10000;

export interface ReduceContext {
  now: number;
  bridge: BridgeLink;
  source: Source;
  bridgeVersion: string;
  protocol: number;
}

const PRIORITY: Record<Status, number> = {
  offline: 0,
  permission_required: 1,
  user_input_required: 2,
  error: 3,
  retrying: 4,
  compacting: 5,
  working: 6,
  thinking: 7,
  generating: 8,
  success: 9,
  interrupted: 10,
  idle: 11,
};

export function effectiveStatus(session: SessionState, now: number): Status {
  if (session.terminalAt === null) {
    return session.status;
  }
  const elapsed = now - session.terminalAt;
  if (session.status === 'success' && elapsed > SUCCESS_TTL_MS) return 'idle';
  if (session.status === 'error' && elapsed > ERROR_TTL_MS) return 'idle';
  if (session.status === 'interrupted' && elapsed > INTERRUPTED_TTL_MS) return 'idle';
  return session.status;
}

export function aggregateStatus(sessions: readonly SessionState[], now: number, bridge: BridgeLink): Status {
  if (bridge !== 'ready') {
    return 'offline';
  }
  let best: Status = 'idle';
  for (const session of sessions) {
    const status = effectiveStatus(session, now);
    if (PRIORITY[status] < PRIORITY[best]) {
      best = status;
    }
  }
  return best;
}

function focusSession(sessions: readonly SessionState[], now: number): SessionState | null {
  let best: SessionState | null = null;
  for (const session of sessions) {
    if (best === null) {
      best = session;
      continue;
    }
    const a = effectiveStatus(session, now);
    const b = effectiveStatus(best, now);
    if (PRIORITY[a] < PRIORITY[b]) {
      best = session;
    } else if (PRIORITY[a] === PRIORITY[b]) {
      const aStart = session.startedAt ?? session.updatedAt;
      const bStart = best.startedAt ?? best.updatedAt;
      if (aStart < bStart) {
        best = session;
      }
    }
  }
  return best;
}

function isActive(status: Status): boolean {
  return status !== 'idle' && status !== 'success' && status !== 'error' && status !== 'interrupted' &&
    status !== 'offline';
}

export function reduceState(
  sessions: readonly SessionState[],
  metrics: MetricsSnapshot,
  mcp: McpStatusData | null,
  opencode: OpenCodeLink,
  context: ReduceContext,
): StateData {
  const status = aggregateStatus(sessions, context.now, context.bridge);
  const focus = focusSession(sessions, context.now);

  let activeSessions = 0;
  let pendingPermissions = 0;
  let pendingQuestions = 0;
  let notifications = 0;

  for (const session of sessions) {
    const effective = effectiveStatus(session, context.now);
    if (isActive(effective)) ++activeSessions;
    pendingPermissions += session.pendingPermissions;
    pendingQuestions += session.pendingQuestions;
    if (effective === 'success' || effective === 'error' || effective === 'interrupted') {
      ++notifications;
    }
  }

  const elapsedSeconds =
    focus !== null && focus.startedAt !== null
      ? Math.max(0, Math.floor((context.now - focus.startedAt) / 1000))
      : 0;

  const state: StateData = {
    status,
    model: focus?.model ?? null,
    agent: focus?.agent ?? null,
    activeSessions: Math.min(activeSessions, 65535),
    elapsedSeconds,
    pendingPermissions: Math.min(pendingPermissions, 255),
    pendingQuestions: Math.min(pendingQuestions, 255),
    notifications: Math.min(notifications, 99),
    retryAttempt: focus?.retryAttempt ?? 0,
    tokens: metrics.tokens.available
      ? {
          input: metrics.tokens.input,
          output: metrics.tokens.output,
          total: metrics.tokens.total,
          contextPct: null,
        }
      : { input: null, output: null, total: null, contextPct: null },
    tools: metrics.tools,
    connection: { bridge: context.bridge, opencode },
    versions: { bridge: context.bridgeVersion, protocol: context.protocol },
    source: context.source,
  };

  if (mcp !== null) {
    state.mcp = { online: mcp.online, total: mcp.total };
  }
  return state;
}
