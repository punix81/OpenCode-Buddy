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
}

// Turns validated plugin messages into Buddy events. It owns everything that must
// survive between messages: MCP alias assignment, the sessions announced by any
// peer, and per-peer liveness.
//
// One plugin instance exists per OpenCode location, so several peers are normal
// and the link is only offline when every peer is gone.
export class LiveSource {
  private readonly paths: IpcPaths;
  private readonly server: IpcServer;
  private readonly aliases = new Map<string, string>();
  private readonly sessions = new Set<string>();
  private readonly peers = new Map<number, PeerState>();
  private watchdog: NodeJS.Timeout | null = null;
  private announcedConnected = false;

  constructor(private readonly options: LiveSourceOptions) {
    this.paths = options.paths ?? ipcPaths();
    this.server = new IpcServer({
      paths: this.paths,
      logger: options.logger,
      onHello: (peer, hello) => this.onHello(peer, hello),
      onEvent: (peer, raw) => this.onEvent(peer, raw),
      onHeartbeat: (peer) => this.touch(peer),
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
    this.markOffline();
    await this.server.stop();
  }

  private touch(peer: number): void {
    const state = this.peers.get(peer);
    if (state !== undefined) state.lastSeen = Date.now();
  }

  private onHello(peer: number, hello: IpcHello): void {
    this.peers.set(peer, { hello, lastSeen: Date.now() });
    this.options.logger.info(
      `opencode peer=${peer} app=${hello.app} version=${hello.appVersion} plugin=${hello.plugin} version=${hello.pluginVersion}`,
    );
    if (!this.announcedConnected) {
      this.announcedConnected = true;
      this.options.bridge.ingest({ kind: 'opencode.connected', at: Date.now() });
    }
  }

  private onDisconnect(peer: number): void {
    if (!this.peers.delete(peer)) return;
    this.options.logger.info(`opencode peer=${peer} disconnected, peers=${this.peers.size}`);
    if (this.peers.size === 0) this.markOffline();
  }

  private checkStale(): void {
    const now = Date.now();
    for (const [peer, state] of this.peers) {
      if (now - state.lastSeen <= LIVE_STALE_MS) continue;
      this.peers.delete(peer);
      this.options.logger.warn(`opencode peer=${peer} silent, dropped`);
    }
    if (this.peers.size === 0 && this.announcedConnected) this.markOffline();
  }

  // Connection loss invalidates what the plugin told us: a pending permission must
  // not stay on screen for a session nobody is watching anymore.
  private markOffline(): void {
    if (!this.announcedConnected) return;
    this.announcedConnected = false;
    const at = Date.now();
    this.peers.clear();
    this.options.bridge.ingest({ kind: 'opencode.offline', at });
    for (const sessionId of this.sessions) {
      this.options.bridge.ingest({ kind: 'session.closed', sessionId, at });
    }
    this.sessions.clear();
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
    this.track(event);
    this.options.bridge.ingest(event);
  }

  private track(event: NormalizedEvent): void {
    switch (event.kind) {
      case 'session.closed':
        this.sessions.delete(event.sessionId);
        return;
      default:
        if ('sessionId' in event) this.sessions.add(event.sessionId);
        return;
    }
  }
}
