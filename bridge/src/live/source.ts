import type { Bridge } from '../bridge.js';
import type { BridgeConfig } from '../config.js';
import type { IpcHello } from '../ipc/messages.js';
import { IPC_MAX_SERVERS, normalizeMcpStatus } from '../ipc/messages.js';
import { ipcPaths, type IpcPaths } from '../ipc/paths.js';
import { IpcServer } from '../ipc/server.js';
import type { Logger } from '../logger.js';
import { normalizeEvent } from '../normalize/normalizer.js';
import type { NormalizedEvent } from '../state/types.js';

// The plugin writes at least one heartbeat per beat interval; three missed beats
// mean that OpenCode location is gone even if the socket was never closed.
export const LIVE_STALE_MS = 15_000;
export const LIVE_WATCHDOG_MS = 5_000;
// The snapshot restores at most 20 sessions per peer; this cap is a hard bound
// for a misbehaving peer, not for normal use.
export const MAX_SESSIONS_PER_PEER = 64;

export interface LiveSourceOptions {
  bridge: Bridge;
  config: BridgeConfig;
  logger: Logger;
  paths?: IpcPaths;
}

export interface LiveStatus {
  connected: boolean;
  peers: number;
  appVersion: string | null;
  pluginVersion: string | null;
  lastEventAt: number | null;
}

interface PeerState {
  hello: IpcHello;
  lastSeen: number;
  health: 'ok' | 'degraded';
}

// Turns validated plugin messages into Buddy events. It owns everything that must
// survive between messages: MCP alias assignment, session ownership and per-peer
// liveness.
//
// One plugin instance exists per OpenCode location, so several peers are normal.
// A session belongs to exactly one peer: when that peer disappears (or its event
// source fails), only its own sessions are invalidated, never another project's.
export class LiveSource {
  private readonly paths: IpcPaths;
  private readonly server: IpcServer;
  private readonly aliases = new Map<string, string>();
  private readonly peers = new Map<number, PeerState>();
  private readonly sessionsByPeer = new Map<number, Set<string>>();
  private readonly owners = new Map<string, number>();
  private readonly terminal = new Set<string>();
  private watchdog: NodeJS.Timeout | null = null;
  private opencode: 'connected' | 'offline' | 'unknown' = 'unknown';

  constructor(private readonly options: LiveSourceOptions) {
    this.paths = options.paths ?? ipcPaths();
    this.server = new IpcServer({
      paths: this.paths,
      logger: options.logger,
      onHello: (peer, hello) => this.onHello(peer, hello),
      onEvent: (peer, raw) => this.onEvent(peer, raw),
      onHeartbeat: (peer) => this.touch(peer),
      onSource: (peer, status) => this.onSource(peer, status),
      onDisconnect: (peer) => this.onDisconnect(peer),
    });
  }

  get status(): LiveStatus {
    const first = this.peers.values().next();
    const hello = first.done ? null : first.value.hello;
    const lastEventAt = first.done ? null : first.value.lastSeen;
    return {
      connected: this.peers.size > 0,
      peers: this.peers.size,
      appVersion: hello?.appVersion ?? null,
      pluginVersion: hello?.pluginVersion ?? null,
      lastEventAt,
    };
  }

  async start(): Promise<void> {
    await this.server.start();
    this.watchdog = setInterval(() => this.checkStale(), LIVE_WATCHDOG_MS);
    this.watchdog.unref();
  }

  async stop(): Promise<void> {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    for (const peer of [...this.peers.keys()]) this.dropPeer(peer, 'shutdown');
    this.setOpenCode('offline');
    await this.server.stop();
  }

  private touch(peer: number): void {
    const state = this.peers.get(peer);
    if (state !== undefined) state.lastSeen = Date.now();
  }

  private setOpenCode(value: 'connected' | 'offline' | 'unknown'): void {
    if (value !== 'connected') this.options.bridge.setOpenCodeVersion(null);
    if (value === this.opencode) return;
    this.opencode = value;
    if (value === 'connected') this.options.bridge.ingest({ kind: 'opencode.connected', at: Date.now() });
    else if (value === 'offline') this.options.bridge.ingest({ kind: 'opencode.offline', at: Date.now() });
    else this.options.bridge.ingest({ kind: 'opencode.unknown', at: Date.now() });
  }

  private healthyPeerExists(): boolean {
    for (const state of this.peers.values()) {
      if (state.health === 'ok') return true;
    }
    return false;
  }

  private onHello(peer: number, hello: IpcHello): void {
    this.peers.set(peer, { hello, lastSeen: Date.now(), health: 'ok' });
    this.options.logger.info(
      `opencode peer=${peer} app=${hello.app} version=${hello.appVersion} plugin=${hello.plugin} version=${hello.pluginVersion}`,
    );
    this.options.bridge.setOpenCodeVersion(hello.appVersion);
    this.setOpenCode('connected');
  }

  private onSource(peer: number, status: 'ok' | 'degraded'): void {
    const state = this.peers.get(peer);
    if (state === undefined) return;
    state.health = status;
    state.lastSeen = Date.now();
    this.options.logger.debug(`opencode peer=${peer} source=${status}`);
    if (status === 'degraded') {
      this.options.logger.warn(`opencode peer=${peer} event source degraded`);
      this.closePeerSessions(peer, 'degraded');
      if (!this.healthyPeerExists()) this.setOpenCode('offline');
    } else {
      this.setOpenCode('connected');
    }
  }

  private onDisconnect(peer: number): void {
    if (!this.peers.delete(peer)) return;
    this.options.logger.info(`opencode peer=${peer} disconnected, peers=${this.peers.size}`);
    this.closePeerSessions(peer, 'disconnect');
    this.sessionsByPeer.delete(peer);
    if (!this.healthyPeerExists()) this.setOpenCode('offline');
  }

  private checkStale(): void {
    const now = Date.now();
    for (const [peer, state] of this.peers) {
      if (now - state.lastSeen <= LIVE_STALE_MS) continue;
      this.options.logger.warn(`opencode peer=${peer} silent, dropped`);
      this.dropPeer(peer, 'stale');
    }
    if (this.peers.size === 0) this.setOpenCode('offline');
  }

  private dropPeer(peer: number, reason: string): void {
    if (!this.peers.delete(peer)) return;
    this.options.logger.info(`opencode peer=${peer} dropped reason=${reason}`);
    this.closePeerSessions(peer, reason);
    this.sessionsByPeer.delete(peer);
  }

  // Terminal notifications stay on screen for their TTL even when OpenCode goes
  // away right after them; every other session of that peer is invalidated.
  private closePeerSessions(peer: number, reason: string): void {
    const sessions = this.sessionsByPeer.get(peer);
    if (sessions === undefined) return;
    for (const sessionId of [...sessions]) {
      if (!this.terminal.has(sessionId)) {
        this.options.logger.debug(`session closed reason=${reason}`);
        this.options.bridge.ingest({ kind: 'session.closed', sessionId, at: Date.now() });
      }
      this.forget(sessionId);
    }
    sessions.clear();
  }

  private forget(sessionId: string): void {
    this.owners.delete(sessionId);
    this.terminal.delete(sessionId);
  }

  private own(peer: number, sessionId: string): void {
    let sessions = this.sessionsByPeer.get(peer);
    if (sessions === undefined) {
      sessions = new Set<string>();
      this.sessionsByPeer.set(peer, sessions);
    }
    if (sessions.has(sessionId)) return;
    if (sessions.size >= MAX_SESSIONS_PER_PEER) {
      // Prefer evicting an already finished session; a running one would be a
      // lie to the user. If every session is terminal, evict the oldest one.
      const victim = [...sessions].find((id) => !this.terminal.has(id)) ?? sessions.values().next().value;
      if (victim !== undefined) {
        this.options.bridge.ingest({ kind: 'session.closed', sessionId: victim, at: Date.now() });
        this.forget(victim);
        sessions.delete(victim);
      }
    }
    sessions.add(sessionId);
    this.owners.set(sessionId, peer);
  }

  private aliasFor(name: string): string {
    const existing = this.aliases.get(name);
    if (existing !== undefined) return existing;
    if (this.aliases.size >= IPC_MAX_SERVERS) return 'MCP';
    const alias = `MCP-${this.aliases.size + 1}`;
    this.aliases.set(name, alias);
    return alias;
  }

  private onEvent(peer: number, raw: Record<string, unknown>): void {
    this.touch(peer);
    this.options.logger.debug(`event kind=${String(raw['kind'])}`);

    const event: NormalizedEvent | null =
      raw['kind'] === 'mcp.status'
        ? (normalizeMcpStatus(raw, {
            allowRealMcpNames: this.options.config.allowRealMcpNames,
            aliasFor: (name) => this.aliasFor(name),
          }) as NormalizedEvent | null)
        : normalizeEvent(raw);

    if (event === null) {
      this.options.logger.warn(`live event dropped kind=${String(raw['kind'])}`);
      return;
    }

    if (event.kind !== 'mcp.status' && 'sessionId' in event) {
      const sessionId = event.sessionId;
      if (event.kind === 'session.closed') {
        this.forget(sessionId);
        this.sessionsByPeer.get(peer)?.delete(sessionId);
        this.options.bridge.ingest(event);
        return;
      }
      const owner = this.owners.get(sessionId);
      if (owner !== undefined && owner !== peer) {
        this.options.logger.warn('session owned by another peer, dropped');
        return;
      }
      this.own(peer, sessionId);
      if (
        event.kind === 'execution.succeeded' ||
        event.kind === 'execution.failed' ||
        event.kind === 'execution.interrupted'
      ) {
        this.terminal.add(sessionId);
      } else if (event.kind === 'execution.started' || event.kind === 'phase') {
        this.terminal.delete(sessionId);
      }
    }

    this.options.bridge.ingest(event);
  }
}
