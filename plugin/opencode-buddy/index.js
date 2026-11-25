// OpenCode Buddy — OpenCode v2 server plugin.
//
// Runs inside the OpenCode server, projects the public event stream to the Buddy
// state vocabulary and forwards it over a local Unix socket to the bridge.
// No dependency, no build step: `Plugin.define` is an identity function in
// @opencode/plugin 2.0.16, so importing it would only add version coupling.
//
// Failure policy: this plugin must never disturb OpenCode. Every I/O error is
// swallowed, the socket reconnects with a bounded backoff, and the event loop
// keeps draining so the server is never blocked by us.

import { createConnection } from 'node:net';
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProjector, projectSessionSnapshot } from './map.js';

export const PLUGIN_ID = 'opencode-buddy';
export const PLUGIN_VERSION = '0.1.0';
export const IPC_VERSION = 1;

const HEARTBEAT_MS = 5000;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const MCP_THROTTLE_MS = 750;
const MAX_QUEUE = 500;
const MAX_LINE_BYTES = 8192;
const SNAPSHOT_TIMEOUT_MS = 3000;
const SNAPSHOT_WINDOW_MS = 15 * 60 * 1000;

const DEBUG = process.env['OPENCODE_BUDDY_DEBUG'] === '1';
// The OpenCode server detaches its stderr, so debug output goes to a file when
// the developer asks for it. Never enabled by default.
const DEBUG_FILE = process.env['OPENCODE_BUDDY_DEBUG_FILE'] ?? '/tmp/opencode-buddy-debug.log';

function debug(message) {
  if (!DEBUG) return;
  try {
    appendFileSync(DEBUG_FILE, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never disturb OpenCode.
  }
}

// Must stay identical to bridge/src/ipc/paths.ts.
export function ipcPaths(env = process.env) {
  const override = env['OPENCODE_BUDDY_RUNTIME_DIR'];
  const runtime = env['XDG_RUNTIME_DIR'];
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const base = override ?? runtime ?? tmpdir();
  const dir =
    override !== undefined
      ? override
      : runtime !== undefined
        ? join(base, 'opencode-buddy')
        : join(base, `opencode-buddy-${uid}`);
  return { dir, socket: join(dir, 'bridge.sock'), tokenFile: join(dir, 'token') };
}

function readToken(path) {
  try {
    const token = readFileSync(path, 'utf8').trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function withTimeout(promise, ms) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export default {
  id: PLUGIN_ID,
  async setup(ctx) {
    const controller = new AbortController();
    const projector = createProjector();
    const paths = ipcPaths();
    // One OpenCode server serves several projects and its public stream carries
    // every location. The Buddy must only show the project this instance belongs
    // to, so events are filtered on their envelope location.
    const ownDirectory = typeof ctx.location?.directory === 'string' ? ctx.location.directory : null;
    const ownSessions = new Set();

    const locationOf = (event) => {
      const directory = event?.location?.directory;
      return typeof directory === 'string' ? directory : null;
    };
    const sessionOf = (event) => {
      const data = event?.data;
      if (typeof data?.sessionID === 'string') return data.sessionID;
      if (typeof data?.form?.sessionID === 'string') return data.form.sessionID;
      return null;
    };
    const belongs = (event) => {
      const location = locationOf(event);
      const session = sessionOf(event);
      if (location !== null) {
        if (ownDirectory === null || location === ownDirectory) return true;
        if (session !== null) ownSessions.delete(session);
        return false;
      }
      if (session !== null) return ownSessions.has(session) || event?.type === 'session.created';
      return true;
    };

    let socket = null;
    let connected = false;
    let queue = [];
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let mcpTimer = null;
    let lastMcpSentAt = 0;
    let closed = false;

    const send = (message) => {
      const line = `${JSON.stringify({ v: IPC_VERSION, ...message })}\n`;
      if (!connected || socket === null) {
        queue.push(line);
        if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
        return;
      }
      if (line.length > MAX_LINE_BYTES) {
        debug(`dropped oversized message type=${message.type}`);
        return;
      }
      try {
        socket.write(line);
      } catch (error) {
        debug(`write failed: ${error?.message ?? error}`);
      }
    };

    const flush = () => {
      const pending = queue;
      queue = [];
      for (const line of pending) {
        try {
          socket.write(line);
        } catch {
          return;
        }
      }
    };

    const takeSnapshot = async () => {
      try {
        // Only this location, and only sessions that changed recently: an old
        // project session must not resurrect its lifetime totals on reconnect.
        const cutoff = Date.now() - SNAPSHOT_WINDOW_MS;
        const directory = ctx.location?.directory;
        const page = await withTimeout(
          ctx.session.list({ ...(typeof directory === 'string' ? { directory } : {}), limit: 20 }),
          SNAPSHOT_TIMEOUT_MS,
        );
        const sessions = Array.isArray(page?.data) ? page.data : [];
        debug(`snapshot directory=${directory ?? '<none>'} sessions=${sessions.length}`);
        for (const session of sessions) {
          const sessionDir = session?.location?.directory;
          if (ownDirectory !== null && typeof sessionDir === 'string' && sessionDir !== ownDirectory) continue;
          const updated = session?.time?.updated;
          if (typeof updated === 'number' && updated < cutoff) continue;
          if (typeof session?.id === 'string') ownSessions.add(session.id);
          for (const event of projectSessionSnapshot(session)) send({ type: 'event', event });
        }
      } catch (error) {
        debug(`session snapshot skipped: ${error?.message ?? error}`);
      }
      try {
        const page = await withTimeout(ctx.mcp.list(), SNAPSHOT_TIMEOUT_MS);
        const servers = Array.isArray(page?.data) ? page.data : [];
        debug(`mcp snapshot servers=${servers.length} sample=${JSON.stringify(servers[0]?.status ?? null)}`);
        projector.seedMcp(servers);
        flushMcp();
      } catch (error) {
        debug(`mcp snapshot skipped: ${error?.message ?? error}`);
      }
      // permission.list is session-scoped: ask only for the sessions this
      // instance just restored, and only a bounded number of them.
      let restored = 0;
      for (const session of ownSessions) {
        if (restored >= 8) break;
        ++restored;
        try {
          const page = await withTimeout(
            ctx.permission.list({ sessionID: session }),
            SNAPSHOT_TIMEOUT_MS,
          );
          const requests = Array.isArray(page?.data) ? page.data : [];
          for (const request of requests) {
            if (request?.sessionID !== session) continue;
            send({ type: 'event', event: { kind: 'permission.asked', sessionId: session, at: Date.now() } });
          }
        } catch (error) {
          debug(`permission snapshot skipped: ${error?.message ?? error}`);
        }
      }
    };

    const flushMcp = () => {
      const mcp = projector.takeMcp();
      if (mcp === null) return;
      // An empty reconciliation result must not delay the first real status.
      if (mcp.total > 0) lastMcpSentAt = Date.now();
      send({ type: 'event', event: mcp });
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer !== null) return;
      const delay = reconnectDelay;
      reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
      reconnectTimer.unref?.();
    };

    const connect = () => {
      if (closed) return;
      const token = readToken(paths.tokenFile);
      if (token === null) {
        debug(`no token at ${paths.tokenFile}; bridge not running`);
        scheduleReconnect();
        return;
      }
      connected = false;
      socket = createConnection(paths.socket);
      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      socket.on('connect', () => {
        connected = true;
        reconnectDelay = RECONNECT_MIN_MS;
        debug('connected');
        socket.write(
          `${JSON.stringify({
            v: IPC_VERSION,
            type: 'hello',
            token,
            pid: process.pid,
            app: ctx.app?.name ?? 'opencode',
            appVersion: ctx.app?.version ?? '--',
            plugin: PLUGIN_ID,
            pluginVersion: PLUGIN_VERSION,
          })}\n`,
        );
        flush();
        void takeSnapshot();
      });
      socket.on('data', () => {
        // The bridge never replies; reading keeps the socket flowing.
      });
      socket.on('error', (error) => {
        debug(`socket error: ${error?.message ?? error}`);
      });
      socket.on('close', () => {
        connected = false;
        socket = null;
        scheduleReconnect();
      });
    };

    heartbeatTimer = setInterval(() => {
      send({ type: 'heartbeat', at: Date.now() });
    }, HEARTBEAT_MS);
    heartbeatTimer.unref?.();

    connect();

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!belongs(event)) continue;
          const session = sessionOf(event);
          if (session !== null) {
            if (event?.type === 'session.created') ownSessions.add(session);
            if (event?.type === 'session.deleted') ownSessions.delete(session);
          }
          const projected = projector.project(event);
          debug(
            `event ${String(event?.type)} loc=${locationOf(event) ?? '-'} same=${locationOf(event) === ownDirectory} session=${sessionOf(event) ?? '-'} projected=${projected.length}`,
          );
          for (const normalized of projected) send({ type: 'event', event: normalized });

          if (event?.type === 'mcp.status.changed') {
            // Leading edge first: a short `run` must not lose the radar to a
            // pending throttle timer. Later changes are coalesced.
            const elapsed = Date.now() - lastMcpSentAt;
            if (elapsed >= MCP_THROTTLE_MS) {
              flushMcp();
            } else if (mcpTimer === null) {
              mcpTimer = setTimeout(() => {
                mcpTimer = null;
                flushMcp();
              }, MCP_THROTTLE_MS - elapsed);
              mcpTimer.unref?.();
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) debug(`event stream ended: ${error?.message ?? error}`);
      }
    })();

    return () => {
      closed = true;
      // A short run may end inside the MCP throttle window: push what we have.
      flushMcp();
      controller.abort();
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (mcpTimer !== null) clearTimeout(mcpTimer);
      try {
        socket?.end();
        socket?.destroy();
      } catch {
        // Nothing to do during unload.
      }
      socket = null;
      connected = false;
      projector.reset();
    };
  },
};
