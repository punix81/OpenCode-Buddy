// Pure projection from OpenCode v2 events to OpenCode Buddy NormalizedEvent
// objects. No I/O, no timers: every function here is deterministic so it can be
// tested against real captured payloads.
//
// Safety contract: only the fields named in each projection leave this module.
// Prompts, responses, reasoning text, tool arguments, tool output, commands and
// paths are never read, even when the source event carries them.

export const MAX_SESSION_ID = 64;
export const MAX_TOOL_ID = 64;
export const MAX_MODEL = 40;
export const MAX_AGENT = 24;
export const MAX_SERVERS = 16;

const CATEGORY_RULES = [
  ['edit', /^(edit|write|patch|multiedit|apply|replace|create)/i],
  ['read', /^(read|cat|view|open|list|ls)/i],
  ['search', /^(grep|search|glob|find|websearch|webfetch)/i],
  ['shell', /^(bash|shell|sh|exec|run|terminal|command|pty)/i],
];

export function categoryFor(name) {
  if (typeof name !== 'string' || name.length === 0) return 'other';
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(name)) return category;
  }
  // MCP tools are namespaced as `<server>_<tool>`; nothing built in uses `_`.
  if (name.includes('_')) return 'mcp';
  return 'other';
}

function id(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

function usageFrom(tokens) {
  const out = {};
  const input = count(tokens?.input);
  const output = count(tokens?.output);
  const reasoning = count(tokens?.reasoning);
  const cacheRead = count(tokens?.cache?.read);
  const cacheWrite = count(tokens?.cache?.write);
  if (input !== undefined) out.input = input;
  if (output !== undefined) out.output = output;
  if (reasoning !== undefined) out.reasoning = reasoning;
  if (cacheRead !== undefined) out.cacheRead = cacheRead;
  if (cacheWrite !== undefined) out.cacheWrite = cacheWrite;
  return out;
}

function modelId(model) {
  if (model === null || typeof model !== 'object') return null;
  return id(model.id, MAX_MODEL);
}

// Stateful only for two bounded caches: tool-call id -> tool name (the name is
// announced on `session.tool.input.started`, the call on `session.tool.called`)
// and the last agent/model seen per session.
export function createProjector() {
  const toolNames = new Map();
  const selections = new Map();
  const mcp = new Map();
  let mcpDirty = false;

  function rememberTool(callId, name) {
    if (callId === null || name === null) return;
    toolNames.set(callId, name);
    if (toolNames.size > 512) {
      const oldest = toolNames.keys().next();
      if (!oldest.done) toolNames.delete(oldest.value);
    }
  }

  function remember(sessionID, patch) {
    if (sessionID === null) return;
    const current = selections.get(sessionID) ?? { agent: null, model: null };
    selections.set(sessionID, { ...current, ...patch });
    if (selections.size > 64) {
      const oldest = selections.keys().next();
      if (!oldest.done) selections.delete(oldest.value);
    }
  }

  function selectionEvent(sessionID, at) {
    const current = selections.get(sessionID);
    if (!current || current.agent === null || current.model === null) return null;
    return { kind: 'model', sessionId: sessionID, at, model: current.model, agent: current.agent };
  }

  function project(event) {
    if (event === null || typeof event !== 'object') return [];
    const type = event.type;
    const data = event.data ?? {};
    const at = typeof event.created === 'number' ? event.created : Date.now();
    const sessionID = id(data.sessionID, MAX_SESSION_ID);
    const out = [];
    const push = (value) => {
      if (value !== null) out.push(value);
    };

    switch (type) {
      case 'session.created': {
        if (sessionID === null) return [];
        remember(sessionID, {
          agent: id(data.agent, MAX_AGENT),
          model: modelId(data.model),
        });
        push({ kind: 'session.started', sessionId: sessionID, at });
        push(selectionEvent(sessionID, at));
        return out;
      }
      case 'session.deleted':
        if (sessionID !== null) push({ kind: 'session.closed', sessionId: sessionID, at });
        return out;
      case 'session.status':
        if (sessionID !== null && data.status?.type === 'retry') {
          push({
            kind: 'retry.scheduled',
            sessionId: sessionID,
            at,
            attempt: Math.min(255, Math.max(1, count(data.status.attempt) ?? 1)),
          });
        }
        return out;
      case 'session.idle':
        if (sessionID !== null) push({ kind: 'session.idle', sessionId: sessionID, at });
        return out;
      case 'session.execution.started':
        if (sessionID !== null) push({ kind: 'execution.started', sessionId: sessionID, at });
        return out;
      case 'session.execution.succeeded':
        if (sessionID !== null) push({ kind: 'execution.succeeded', sessionId: sessionID, at });
        return out;
      case 'session.execution.failed':
        if (sessionID !== null) push({ kind: 'execution.failed', sessionId: sessionID, at });
        return out;
      case 'session.execution.interrupted':
        if (sessionID !== null) push({ kind: 'execution.interrupted', sessionId: sessionID, at });
        return out;
      case 'session.step.started': {
        if (sessionID === null) return [];
        remember(sessionID, {
          agent: id(data.agent, MAX_AGENT),
          model: modelId(data.model),
        });
        push(selectionEvent(sessionID, at));
        push({ kind: 'phase', sessionId: sessionID, at, status: 'thinking' });
        return out;
      }
      case 'session.step.first-token':
        if (sessionID !== null) push({ kind: 'phase', sessionId: sessionID, at, status: 'generating' });
        return out;
      case 'session.reasoning.started':
        if (sessionID !== null) push({ kind: 'phase', sessionId: sessionID, at, status: 'thinking' });
        return out;
      case 'session.text.started':
        if (sessionID !== null) push({ kind: 'phase', sessionId: sessionID, at, status: 'generating' });
        return out;
      case 'session.model.selected':
        if (sessionID === null) return [];
        remember(sessionID, { model: modelId(data.model) });
        push(selectionEvent(sessionID, at));
        return out;
      case 'session.agent.selected':
        if (sessionID === null) return [];
        remember(sessionID, { agent: id(data.agent, MAX_AGENT) });
        push(selectionEvent(sessionID, at));
        return out;
      case 'session.tool.input.started':
        rememberTool(id(data.id, MAX_TOOL_ID), id(data.name, MAX_TOOL_ID));
        return out;
      case 'session.tool.called': {
        if (sessionID === null) return [];
        const toolId = id(data.id, MAX_TOOL_ID);
        if (toolId === null) return [];
        push({
          kind: 'tool.started',
          sessionId: sessionID,
          at,
          toolId,
          ...(id(data.assistantMessageID, MAX_TOOL_ID) !== null
            ? { messageId: id(data.assistantMessageID, MAX_TOOL_ID) }
            : {}),
          category: categoryFor(toolNames.get(toolId)),
        });
        return out;
      }
      case 'session.tool.success':
      case 'session.tool.failed': {
        if (sessionID === null) return [];
        const toolId = id(data.id, MAX_TOOL_ID);
        if (toolId === null) return [];
        push({
          kind: type === 'session.tool.success' ? 'tool.succeeded' : 'tool.failed',
          sessionId: sessionID,
          at,
          toolId,
          ...(id(data.assistantMessageID, MAX_TOOL_ID) !== null
            ? { messageId: id(data.assistantMessageID, MAX_TOOL_ID) }
            : {}),
          category: categoryFor(toolNames.get(toolId)),
        });
        return out;
      }
      case 'permission.asked':
        if (sessionID !== null) push({ kind: 'permission.asked', sessionId: sessionID, at });
        return out;
      case 'permission.replied':
        if (sessionID !== null) push({ kind: 'permission.replied', sessionId: sessionID, at });
        return out;
      case 'form.created': {
        const formSession = id(data.form?.sessionID, MAX_SESSION_ID);
        if (formSession !== null) push({ kind: 'question.asked', sessionId: formSession, at });
        return out;
      }
      case 'form.replied':
      case 'form.cancelled':
        if (sessionID !== null) push({ kind: 'question.replied', sessionId: sessionID, at });
        return out;
      case 'session.compaction.started':
        if (sessionID !== null) push({ kind: 'compaction.started', sessionId: sessionID, at });
        return out;
      case 'session.compaction.ended':
      case 'session.compaction.failed':
        if (sessionID !== null) push({ kind: 'compaction.ended', sessionId: sessionID, at });
        return out;
      case 'session.usage.updated': {
        if (sessionID === null) return [];
        const usage = usageFrom(data.tokens);
        if (Object.keys(usage).length === 0) return [];
        push({ kind: 'usage', sessionId: sessionID, at, ...usage });
        return out;
      }
      case 'mcp.status.changed': {
        // Runtime shape (verified on 2.4.1): `data.server` is the changed server's
        // NAME as a string. It carries no status, so it cannot feed the radar by
        // itself: the status only comes from ctx.mcp.list(), which the plugin
        // queries on this event. Object and array shapes are accepted defensively.
        const payload = data.server;
        if (typeof payload === 'string') return out;
        const entries = Array.isArray(payload) ? payload : [payload];
        for (const server of entries) {
          const name = id(server?.name, 64);
          // Mcp.Server.status is an object with a `status` discriminant
          // ({ status: "connected" }); a bare string is accepted for robustness.
          const status = typeof server?.status === 'string' ? server.status : server?.status?.status;
          if (name === null || typeof status !== 'string') continue;
          if (!['connected', 'pending', 'disabled', 'failed', 'needs_auth'].includes(status)) continue;
          mcp.set(name, status);
          mcpDirty = true;
        }
        if (mcp.size > MAX_SERVERS) {
          for (const key of mcp.keys()) {
            if (mcp.size <= MAX_SERVERS) break;
            mcp.delete(key);
          }
        }
        return out;
      }
      default:
        return out;
    }
  }

  return {
    project,
    takeMcp() {
      if (!mcpDirty) return null;
      mcpDirty = false;
      const servers = [...mcp.entries()].slice(0, MAX_SERVERS).map(([name, status]) => ({ name, status }));
      return {
        kind: 'mcp.status',
        at: Date.now(),
        online: servers.filter((entry) => entry.status === 'connected').length,
        total: servers.length,
        servers,
      };
    },
    seedMcp(servers) {
      for (const server of servers) {
        const name = id(server?.name, 64);
        const status = typeof server?.status === 'string' ? server.status : server?.status?.status;
        if (name === null || typeof status !== 'string') continue;
        mcp.set(name, status);
      }
      mcpDirty = true;
    },
    reset() {
      toolNames.clear();
      selections.clear();
    },
  };
}

// Reconnect restore: one Session.Info becomes a session.started plus the model
// and cumulative usage that the device can display immediately. Terminal outcome
// is deliberately not replayed: a finished session must not flash SUCCESS on a
// reconnect.
export function projectSessionSnapshot(session) {
  const sessionID = id(session?.id, MAX_SESSION_ID);
  if (sessionID === null) return [];
  const at = Date.now();
  const out = [{ kind: 'session.started', sessionId: sessionID, at }];
  // A bridge that (re)connects in the middle of an execution has missed
  // session.execution.started. Session.Info.time.busy is the start of the
  // current busy period, so restoring it keeps the duration truthful instead of
  // pinning the timer at zero until the next execution.
  const busy = typeof session?.time?.busy === 'number' ? session.time.busy : null;
  const idle = typeof session?.time?.idle === 'number' ? session.time.idle : null;
  if (busy !== null && busy <= at && (idle === null || busy > idle)) {
    out.push({ kind: 'execution.started', sessionId: sessionID, at: busy });
  }
  const agent = id(session?.agent, MAX_AGENT);
  const model = modelId(session?.model);
  if (agent !== null && model !== null) {
    out.push({ kind: 'model', sessionId: sessionID, at, model, agent });
  }
  const usage = usageFrom(session?.tokens);
  if (Object.keys(usage).length > 0) out.push({ kind: 'usage', sessionId: sessionID, at, ...usage });
  return out;
}
