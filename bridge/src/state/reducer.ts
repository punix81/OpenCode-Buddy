import type {
  BridgeLink,
  McpStatusData,
  OpenCodeLink,
  Source,
  StateData,
  Status,
} from '../protocol/types.js';
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
  // Version reported by the OpenCode peer over IPC. Optional: the field is
  // omitted until a peer has identified itself.
  opencodeVersion?: string | null;
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

function activityWithTtl(session: SessionState, now: number): Status {
  if (session.terminalAt === null) {
    return session.status;
  }
  const elapsed = now - session.terminalAt;
  if (session.status === 'success' && elapsed > SUCCESS_TTL_MS) return 'idle';
  if (session.status === 'error' && elapsed > ERROR_TTL_MS) return 'idle';
  if (session.status === 'interrupted' && elapsed > INTERRUPTED_TTL_MS) return 'idle';
  return session.status;
}

// Pending interactions are not an activity: they are a derived priority on top
// of whatever the session was doing. A later phase or tool event therefore
// cannot erase a permission prompt, and resolving it restores the real activity.
export function effectiveStatus(session: SessionState, now: number): Status {
  if (session.pendingPermissions > 0) return 'permission_required';
  if (session.pendingQuestions > 0) return 'user_input_required';
  return activityWithTtl(session, now);
}

function isTerminal(status: Status): boolean {
  return status === 'success' || status === 'error' || status === 'interrupted';
}

function isActive(status: Status): boolean {
  return status !== 'idle' && status !== 'success' && status !== 'error' &&
    status !== 'interrupted' && status !== 'offline';
}

export function aggregateStatus(
  sessions: readonly SessionState[],
  now: number,
  bridge: BridgeLink,
  opencode: OpenCodeLink,
  source: Source,
): Status {
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
  // A terminal notification stays observable even if OpenCode disappears right
  // after it; otherwise a connected USB link with no OpenCode is OFFLINE, not
  // IDLE. MOCK is explicit and does not depend on an OpenCode peer.
  if (isTerminal(best)) return best;
  if (source === 'live' && opencode !== 'connected') return 'offline';
  return best;
}

// At equal priority the most recently active session wins: the screen must show
// the session the user is actually working in, not the oldest one.
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
    } else if (PRIORITY[a] === PRIORITY[b] && session.updatedAt > best.updatedAt) {
      best = session;
    }
  }
  return best;
}

// The chronometer measures one execution: it runs while the focus session is
// active, freezes on its terminal value for the notification TTL, and reads zero
// once the session is idle again. A start time from a previous execution must
// never leak into the next one.
function elapsedSecondsFor(focus: SessionState | null, effective: Status, now: number): number {
  if (focus === null || focus.startedAt === null) return 0;
  let end: number;
  if (isActive(effective)) {
    end = now;
  } else if (isTerminal(effective)) {
    end = focus.terminalAt ?? now;
  } else {
    return 0;
  }
  return Math.max(0, Math.floor((end - focus.startedAt) / 1000));
}

function tokenState(focus: SessionState | null): StateData['tokens'] {
  if (focus === null || !focus.tokens.available) {
    return { input: null, output: null, total: null, contextPct: null };
  }
  const input = focus.tokens.input;
  const output = focus.tokens.output;
  return {
    input,
    output,
    total: input !== null && output !== null ? input + output : null,
    contextPct: null,
  };
}

export function reduceState(
  sessions: readonly SessionState[],
  mcp: McpStatusData | null,
  opencode: OpenCodeLink,
  context: ReduceContext,
): StateData {
  const status = aggregateStatus(sessions, context.now, context.bridge, opencode, context.source);
  const focus = focusSession(sessions, context.now);
  const effective = focus === null ? 'idle' : effectiveStatus(focus, context.now);

  let activeSessions = 0;
  let pendingPermissions = 0;
  let pendingQuestions = 0;
  let notifications = 0;

  for (const session of sessions) {
    const value = effectiveStatus(session, context.now);
    if (isActive(value)) ++activeSessions;
    pendingPermissions += session.pendingPermissions;
    pendingQuestions += session.pendingQuestions;
    if (isTerminal(value)) {
      ++notifications;
    }
  }

  const state: StateData = {
    status,
    model: focus?.model ?? null,
    agent: focus?.agent ?? null,
    activeSessions: Math.min(activeSessions, 65535),
    elapsedSeconds: elapsedSecondsFor(focus, effective, context.now),
    pendingPermissions: Math.min(pendingPermissions, 255),
    pendingQuestions: Math.min(pendingQuestions, 255),
    notifications: Math.min(notifications, 99),
    retryAttempt: focus?.retryAttempt ?? 0,
    tokens: tokenState(focus),
    tools: focus === null
      ? { success: 0, failed: 0, running: 0, categories: { read: 0, edit: 0, shell: 0, search: 0, mcp: 0, other: 0 } }
      : {
          success: focus.tools.success,
          failed: focus.tools.failed,
          running: focus.tools.running,
          categories: { ...focus.tools.categories },
        },
    connection: { bridge: context.bridge, opencode },
    versions: {
      bridge: context.bridgeVersion,
      protocol: context.protocol,
      ...(context.opencodeVersion ? { opencode: context.opencodeVersion } : {}),
    },
    source: context.source,
  };

  if (mcp !== null) {
    state.mcp = { online: mcp.online, total: mcp.total };
  }

  return state;
}
