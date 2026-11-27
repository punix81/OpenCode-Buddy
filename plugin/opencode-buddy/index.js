// OpenCode Buddy — OpenCode v2 server plugin.
//
// Runs inside the OpenCode server, projects the public event stream to the Buddy
// state vocabulary and forwards it over a local Unix socket to the bridge.
// No dependency, no build step: `Plugin.define` is an identity function in
// @opencode/plugin 2.0.16, so importing it would only add version coupling.
//
// Failure policy: this plugin must never disturb OpenCode. Every I/O error is
// swallowed, the socket reconnects with a bounded backoff, the event
// subscription is supervised, and the event loop keeps draining so the server is
// never blocked by us.

import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, win32 } from 'node:path';

import { createProjector, projectSessionSnapshot } from './map.js';
import { eventOwnership } from './isolation.js';
import { shouldDropForBackpressure, frameTooLarge } from './wire.js';

export const PLUGIN_ID = 'opencode-buddy';
export const PLUGIN_VERSION = '0.1.0';
export const IPC_VERSION = 1;

const HEARTBEAT_MS = 5000;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const RESUBSCRIBE_MAX_MS = 15000;
const MCP_THROTTLE_MS = 750;
const MAX_QUEUE = 500;

const SNAPSHOT_TIMEOUT_MS = 3000;
const SNAPSHOT_WINDOW_MS = 15 * 60 * 1000;
const MAX_DEBUG_BYTES = 1 * 1024 * 1024;

const DEBUG = process.env['OPENCODE_BUDDY_DEBUG'] === '1';
// The OpenCode server detaches its stderr, so debug output goes to a file when
// the developer asks for it. Never enabled by default, and private when enabled.
const DEBUG_FILE = process.env['OPENCODE_BUDDY_DEBUG_FILE'] ?? null;
let debugDisabled = false;

// Must stay identical to bridge/src/ipc/paths.ts. On Windows the bridge writes
// a runtime descriptor (pipe path + 256-bit token); the plugin re-reads it on
// every reconnect so a bridge restart is picked up without a plugin restart.
export function ipcPaths(env = process.env, platform = process.platform) {
  const override = env['OPENCODE_BUDDY_RUNTIME_DIR'];
  if (platform === 'win32') {
    const base = env['LOCALAPPDATA'] || env['APPDATA'] || homedir();
    const dir = win32.resolve(override ?? win32.join(base, 'opencode-buddy-ipc'));
    const suffix = createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 16);
    return {
      platform: 'win32',
      dir,
      socket: '\\\\.\\pipe\\opencode-buddy-' + suffix,
      tokenFile: null,
      descriptorFile: win32.join(dir, 'bridge.json'),
    };
  }
  const runtime = env['XDG_RUNTIME_DIR'];
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const base = override ?? runtime ?? tmpdir();
  const dir =
    override !== undefined
      ? override
      : runtime !== undefined
        ? join(base, 'opencode-buddy')
        : join(base, `opencode-buddy-${uid}`);
  return {
    platform: 'unix',
    dir,
    socket: join(dir, 'bridge.sock'),
    tokenFile: join(dir, 'token'),
    descriptorFile: join(dir, 'bridge.json'),
  };
}

// Returns the address and token for the next connection. Unix keeps the
// existing socket/token contract; Windows reads the descriptor written by the
// bridge. Any malformed descriptor is treated as "bridge unavailable", never as
// permission to connect somewhere else.
export function readEndpoint(paths) {
  if (paths.platform !== 'win32') {
    const token = readToken(paths.tokenFile);
    return token === null ? null : { address: paths.socket, token };
  }
  try {
    const raw = JSON.parse(readFileSync(paths.descriptorFile, 'utf8'));
    if (raw?.v !== 1 || raw?.platform !== 'win32') return null;
    if (raw.address !== paths.socket) return null;
    if (typeof raw.token !== 'string' || !/^[a-f0-9]{64}$/.test(raw.token)) return null;
    return { address: raw.address, token: raw.token };
  } catch {
    return null;
  }
}

export function sanitize(message) {
  return String(message)
    .replace(/(?:[A-Za-z]:)?(?:[\\/](?:[^\\/\s"']+)){2,}[\\/]?/g, '<path>')
    .replace(/\b(?:ses|perm|form|msg|evt|tool|call)_[A-Za-z0-9]+/g, '<id>')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 400);
}

function debug(message) {
  if (!DEBUG || debugDisabled) return;
  try {
    const paths = ipcPaths();
    const windows = paths.platform === 'win32';
    if (windows && readEndpoint(paths) === null) return;
    const file = (windows ? null : DEBUG_FILE) ?? join(paths.dir, 'plugin-debug.log');
    if (!windows) mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!existsSync(file)) {
      appendFileSync(file, '', { mode: 0o600, flag: 'wx' });
      if (!windows) chmodSync(file, 0o600);
    }
    const stat = lstatSync(file);
    const line = new Date().toISOString() + ' ' + sanitize(message) + '\n';
    if (!stat.isFile() || stat.size + Buffer.byteLength(line) > MAX_DEBUG_BYTES) {
      debugDisabled = true;
      return;
    }
    appendFileSync(file, line);
  } catch {
    // Diagnostics must never disturb OpenCode.
    debugDisabled = true;
  }
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
    const projector = createProjector();
    const paths = ipcPaths();
    // One OpenCode server serves several projects and its public stream carries
    // every location. The Buddy must only show the project this instance belongs
    // to, so events are filtered on their envelope location.
    const ownDirectory = typeof ctx.location?.directory === 'string' ? ctx.location.directory : null;
    const ownSessions = new Set();

    const sessionOf = (event) => {
      const data = event?.data;
      if (typeof data?.sessionID === 'string') return data.sessionID;
      if (typeof data?.form?.sessionID === 'string') return data.form.sessionID;
      return null;
    };
    const belongs = (event) =>
      eventOwnership(event, ownDirectory, (session) => ownSessions.has(session));

    let socket = null;
    let connected = false;
    let queue = [];
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let mcpTimer = null;
    let lastMcpSentAt = 0;
    let closed = false;
    let snapshotPending = false;
    let generation = 0;
    let droppedQueue = 0;
    let droppedOversized = 0;
    let droppedBackpressure = 0;

    let sourceState = 'unknown';
    let sourceController = null;
    let resubscribeTimer = null;
    let resubscribeDelay = RECONNECT_MIN_MS;

    const enqueue = (line) => {
      queue.push(line);
      if (queue.length > MAX_QUEUE) {
        queue = queue.slice(queue.length - MAX_QUEUE);
        ++droppedQueue;
      }
    };

    // Writes one frame without ever growing the socket's internal buffer beyond
    // a bound. The check runs on UTF-8 bytes, not on JavaScript code units.
    const writeLine = (line, type) => {
      if (!connected || socket === null) {
        enqueue(line);
        return;
      }
      if (frameTooLarge(line)) {
        ++droppedOversized;
        return;
      }
      if (shouldDropForBackpressure(socket.writableLength, type)) {
        ++droppedBackpressure;
        return;
      }
      try {
        socket.write(line);
      } catch {
        debug(`write failed type=${String(type)}`);
      }
    };

    const sendNow = (message) =>
      writeLine(`${JSON.stringify({ v: IPC_VERSION, ...message })}\n`, message.type);

    const send = (message) => {
      const line = `${JSON.stringify({ v: IPC_VERSION, ...message })}\n`;
      if (snapshotPending) {
        enqueue(line);
        return;
      }
      writeLine(line, message.type);
    };

    const flush = () => {
      const pending = queue;
      queue = [];
      for (const line of pending) {
        if (!connected || socket === null) {
          enqueue(line);
          return;
        }
        writeLine(line, 'queued');
      }
    };

    const flushMcp = () => {
      const mcp = projector.takeMcp();
      if (mcp === null) return;
      // An empty reconciliation result must not delay the first real status.
      if (mcp.total > 0) lastMcpSentAt = Date.now();
      debug(`mcp flush total=${mcp.total} online=${mcp.online}`);
      send({ type: 'event', event: mcp });
    };

    // The event only says which server changed; the statuses come from the MCP
    // API. Re-query it instead of guessing.
    const refreshMcp = async () => {
      try {
        const page = await withTimeout(ctx.mcp.list(), SNAPSHOT_TIMEOUT_MS);
        const servers = Array.isArray(page?.data) ? page.data : [];
        debug(`mcp refresh servers=${servers.length}`);
        projector.seedMcp(servers);
        flushMcp();
      } catch {
        debug('mcp refresh skipped');
      }
    };

    const takeSnapshot = async (gen) => {
      // One timestamp for the whole snapshot, captured before listing: live
      // events that arrive during the list are newer and must not be overwritten
      // by stale snapshot data.
      const snapshotAt = Date.now();
      const sendSnapshot = (event) => {
        if (!connected || gen !== generation) return;
        sendNow({ type: 'event', event });
      };
      // The session and MCP lists are independent: fetch them together so a slow
      // API costs one timeout, not two.
      const sessionTask = (async () => {
        const restored = [];
        try {
          // Only this location, and only sessions that changed recently: an old
          // project session must not resurrect its lifetime totals on reconnect.
          const cutoff = snapshotAt - SNAPSHOT_WINDOW_MS;
          const directory = ctx.location?.directory;
          const page = await withTimeout(
            ctx.session.list({ ...(typeof directory === 'string' ? { directory } : {}), limit: 20 }),
            SNAPSHOT_TIMEOUT_MS,
          );
          const sessions = Array.isArray(page?.data) ? page.data : [];
          debug(`snapshot sessions=${sessions.length}`);
          for (const session of sessions) {
            const sessionDir = session?.location?.directory;
            if (ownDirectory !== null && typeof sessionDir === 'string' && sessionDir !== ownDirectory) continue;
            const updated = session?.time?.updated;
            if (typeof updated === 'number' && updated < cutoff) continue;
            if (typeof session?.id === 'string') {
              ownSessions.add(session.id);
              if (restored.length < 8) restored.push(session.id);
            }
            for (const event of projectSessionSnapshot(session, snapshotAt)) sendSnapshot(event);
          }
        } catch {
          debug('session snapshot skipped');
        }
        return restored;
      })();
      const mcpTask = (async () => {
        try {
          const page = await withTimeout(ctx.mcp.list(), SNAPSHOT_TIMEOUT_MS);
          const servers = Array.isArray(page?.data) ? page.data : [];
          debug(`mcp snapshot servers=${servers.length}`);
          projector.seedMcp(servers);
          const mcp = projector.takeMcp();
          if (mcp !== null) {
            if (mcp.total > 0) lastMcpSentAt = Date.now();
            sendSnapshot(mcp);
          }
        } catch {
          debug('mcp snapshot skipped');
        }
      })();
      const [sessionOutcome] = await Promise.allSettled([sessionTask, mcpTask]);
      const restored = sessionOutcome.status === 'fulfilled' ? sessionOutcome.value : [];
      // Permissions are authoritative per session: replace the pending set with
      // the identifiers the API reports, so a reconnect can never double-count
      // a prompt that is already gone. The per-session calls run together under
      // their own 3 s timeout; a hung session cannot delay the others.
      const permissionOutcomes = await Promise.allSettled(
        restored.map(async (session) => {
          const page = await withTimeout(ctx.permission.list({ sessionID: session }), SNAPSHOT_TIMEOUT_MS);
          return { session, page };
        }),
      );
      for (const outcome of permissionOutcomes) {
        if (outcome.status !== 'fulfilled' || outcome.value?.page === undefined) {
          debug('permission snapshot skipped');
          continue;
        }
        const { session, page } = outcome.value;
        const requests = Array.isArray(page?.data) ? page.data : [];
        const requestIds = [];
        for (const request of requests) {
          if (request?.sessionID !== session) continue;
          if (typeof request?.id === 'string' && request.id.length > 0) {
            requestIds.push(request.id.slice(0, 64));
          }
        }
        sendSnapshot({
          kind: 'permission.sync',
          sessionId: session,
          at: snapshotAt,
          requestIds: requestIds.slice(0, 64),
        });
      }
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
      const endpoint = readEndpoint(paths);
      if (endpoint === null) {
        debug('bridge endpoint unavailable');
        scheduleReconnect();
        return;
      }
      const token = endpoint.token;
      connected = false;
      socket = createConnection(endpoint.address);
      socket.setEncoding('utf8');
      socket.setNoDelay(true);

      socket.on('connect', () => {
        connected = true;
        reconnectDelay = RECONNECT_MIN_MS;
        ++generation;
        const gen = generation;
        // The backlog predates this connection and is superseded by the
        // snapshot; live events that arrive during the snapshot are queued.
        if (queue.length > 0) {
          droppedQueue += queue.length;
          queue = [];
        }
        snapshotPending = true;
        debug(`connected generation=${gen}`);
        sendNow({
          v: IPC_VERSION,
          type: 'hello',
          token,
          pid: process.pid,
          app: ctx.app?.name ?? 'opencode',
          appVersion: ctx.app?.version ?? '--',
          plugin: PLUGIN_ID,
          pluginVersion: PLUGIN_VERSION,
        });
        // The health of the event source is told again on every connection: a
        // degraded state reached while the bridge was down must not be lost.
        sendNow({
          type: 'source',
          status: sourceState === 'degraded' ? 'degraded' : 'ok',
          at: Date.now(),
        });
        void (async () => {
          try {
            await takeSnapshot(gen);
          } finally {
            if (connected && gen === generation) {
              snapshotPending = false;
              flush();
            }
          }
        })();
      });
      socket.on('data', () => {
        // The bridge never replies; reading keeps the socket flowing.
      });
      socket.on('error', () => {
        debug('socket error');
      });
      socket.on('close', () => {
        connected = false;
        snapshotPending = false;
        socket = null;
        scheduleReconnect();
      });
    };

    const setSource = (status) => {
      if (sourceState === status) return;
      sourceState = status;
      debug(`event source ${status}`);
      sendNow({ type: 'source', status, at: Date.now() });
    };

    const scheduleResubscribe = () => {
      if (closed || resubscribeTimer !== null) return;
      const delay = resubscribeDelay;
      resubscribeDelay = Math.min(RESUBSCRIBE_MAX_MS, resubscribeDelay * 2);
      resubscribeTimer = setTimeout(() => {
        resubscribeTimer = null;
        void runSubscription();
      }, delay);
      resubscribeTimer.unref?.();
    };

    const runSubscription = async () => {
      if (closed) return;
      const controller = new AbortController();
      sourceController = controller;
      try {
        setSource('ok');
        resubscribeDelay = RECONNECT_MIN_MS;
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!belongs(event)) continue;
          const session = sessionOf(event);
          if (session !== null) {
            if (event?.type === 'session.created') ownSessions.add(session);
            if (event?.type === 'session.deleted') ownSessions.delete(session);
          }
          const projected = projector.project(event);
          debug(`event type=${String(event?.type)} projected=${projected.length}`);
          for (const normalized of projected) send({ type: 'event', event: normalized });

          if (event?.type === 'mcp.status.changed') {
            // Leading edge first: a short `run` must not lose the radar to a
            // pending throttle timer. Later changes are coalesced.
            const elapsed = Date.now() - lastMcpSentAt;
            if (elapsed >= MCP_THROTTLE_MS) {
              void refreshMcp();
            } else if (mcpTimer === null) {
              mcpTimer = setTimeout(() => {
                mcpTimer = null;
                void refreshMcp();
              }, MCP_THROTTLE_MS - elapsed);
              mcpTimer.unref?.();
            }
          }
        }
        if (!closed && !controller.signal.aborted) {
          debug('event stream ended');
          setSource('degraded');
          scheduleResubscribe();
        }
      } catch {
        if (!closed && !controller.signal.aborted) {
          debug('event stream failed');
          setSource('degraded');
          scheduleResubscribe();
        }
      }
    };

    heartbeatTimer = setInterval(() => {
      sendNow({ type: 'heartbeat', at: Date.now() });
    }, HEARTBEAT_MS);
    heartbeatTimer.unref?.();

    connect();
    void runSubscription();

    return () => {
      closed = true;
      // A short run may end inside the MCP throttle window: push what we have.
      flushMcp();
      sourceController?.abort();
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (mcpTimer !== null) clearTimeout(mcpTimer);
      if (resubscribeTimer !== null) clearTimeout(resubscribeTimer);
      try {
        socket?.end();
        socket?.destroy();
      } catch {
        // Nothing to do during unload.
      }
      socket = null;
      connected = false;
      projector.reset();
      if (droppedQueue + droppedOversized + droppedBackpressure > 0) {
        debug(
          `dropped queue=${droppedQueue} oversized=${droppedOversized} backpressure=${droppedBackpressure}`,
        );
      }
    };
  },
};
