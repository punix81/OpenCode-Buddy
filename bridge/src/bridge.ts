import { randomUUID } from 'node:crypto';

import type { BridgeConfig } from './config.js';
import type { Logger } from './logger.js';
import type { AnyMessage, ConfigData, ErrorCode, McpStatusData, StateData } from './protocol/types.js';
import { PROTOCOL_MAJOR } from './protocol/types.js';
import { LineFramer, OutboundSequence, SequenceTracker, encodeMessage, negotiateMajor } from './protocol/codec.js';
import { validateLine } from './protocol/validator.js';
import { PrivacyFilter } from './privacy/privacy.js';
import { SessionRegistry } from './state/registry.js';
import type { NormalizedEvent } from './state/types.js';
import { normalizeEvent } from './normalize/normalizer.js';
import type { Transport } from './transport/types.js';

export type BridgeStatus =
  | 'idle'
  | 'opening'
  | 'handshaking'
  | 'ready'
  | 'degraded'
  | 'reconnecting'
  | 'error';

export interface BridgeOptions {
  transport: Transport;
  config: BridgeConfig;
  logger: Logger;
  autoTimers?: boolean;
  bridgeVersion?: string;
  now?: () => number;
}

const DEFAULT_GESTURES = {
  debounceMs: 35,
  doublePressWindowMs: 350,
  longPressMs: 1500,
  veryLongPressMs: 5000,
} as const;

// Opening the CDC port resets the ESP32-C3 (see docs/troubleshooting.md), and
// the device only re-announces itself every kHelloIntervalMs (3 s) while it has
// no bridge session. A `hello` missed during that reboot window used to leave
// the bridge in `handshaking` forever: no state was ever sent and the display
// stayed OFFLINE until the process was restarted. Give up on the session after
// more than two announcement periods and take the port again.
export const HANDSHAKE_TIMEOUT_MS = 7000;

// A half-open CDC fd never reports close, so `transport.close()` can hang. Bound
// it: shutdown and reconnection must always make progress.
export const CLOSE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export class Bridge {
  private readonly framer = new LineFramer();
  private readonly seqOut = new OutboundSequence();
  private readonly deviceSeq = new SequenceTracker();
  private readonly registry = new SessionRegistry();
  private readonly privacy = new PrivacyFilter();
  private readonly now: () => number;
  private readonly bridgeVersion: string;
  private readonly autoTimers: boolean;

  private readonly sentCounts: Record<string, number> = {};
  private readonly receivedCounts: Record<string, number> = {};
  private readonly pendingAcks = new Map<number, number>();
  private ackCount = 0;
  private ackTotalMs = 0;
  private ackMaxMs = 0;

  private statusValue: BridgeStatus = 'idle';
  private lastRxMs = 0;
  private lastHeartbeatMs = 0;
  private lastStateMs = 0;
  private lastHandshakeMs = 0;
  private lastOpenMs = 0;
  private deviceBoot = -1;
  private snapshotPending = false;
  private dirty = true;
  private tickTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopping = false;

  onState?: (state: StateData) => void;
  onMcpStatus?: (status: McpStatusData) => void;
  onInteraction?: (gesture: string, screen: number) => void;
  onStatus?: (status: BridgeStatus) => void;

  constructor(private readonly options: BridgeOptions) {
    this.now = options.now ?? Date.now;
    this.bridgeVersion = options.bridgeVersion ?? '0.2.0';
    this.autoTimers = options.autoTimers ?? true;
  }

  get status(): BridgeStatus {
    return this.statusValue;
  }

  // Per-type counters for the soak report. They count frames that left the
  // process and frames that passed validation, not frames the device applied.
  get stats(): {
    sent: Record<string, number>;
    received: Record<string, number>;
    ackLatency: { count: number; avgMs: number; maxMs: number };
  } {
    return {
      sent: { ...this.sentCounts },
      received: { ...this.receivedCounts },
      ackLatency: {
        count: this.ackCount,
        avgMs: this.ackCount === 0 ? 0 : Math.round(this.ackTotalMs / this.ackCount),
        maxMs: this.ackMaxMs,
      },
    };
  }

  private setStatus(status: BridgeStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    this.options.logger.info(`bridge status=${status}`);
    this.onStatus?.(status);
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.options.transport.setHandlers({
      onData: (chunk) => this.onData(chunk),
      onError: (error) => this.onError(error),
      onClose: () => this.onClose(),
    });
    await this.openTransport();
    if (this.autoTimers) {
      this.tickTimer = setInterval(() => this.tick(this.now()), 100);
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.tickTimer = null;
    this.reconnectTimer = null;
    // An intentional stop must not look like a link loss in the logs.
    this.setStatus('idle');
    await this.closeTransport();
  }

  ingest(raw: unknown): boolean {
    const event = normalizeEvent(raw);
    if (event === null) {
      this.options.logger.warn('normalized event rejected');
      return false;
    }
    this.registry.apply(event);
    this.dirty = true;
    return true;
  }

  private async openTransport(): Promise<void> {
    this.setStatus('opening');
    try {
      await this.options.transport.open();
      this.framer.reset();
      this.seqOut.reset();
      this.deviceSeq.reset();
      this.deviceBoot = -1;
      this.lastHandshakeMs = 0;
      this.lastRxMs = this.now();
      this.lastOpenMs = this.lastRxMs;
      this.reconnectAttempt = 0;
      this.setStatus('handshaking');
    } catch (error) {
      this.options.logger.error(`transport open failed: ${(error as Error).message}`);
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    }
  }

  private onClose(): void {
    if (this.statusValue === 'idle') return;
    this.setStatus('reconnecting');
    this.scheduleReconnect();
  }

  private onError(error: Error): void {
    // A port-level error (cable unplugged, EIO, driver reset) is a link loss, not
    // a fatal condition: close and let the backoff schedule reopen it.
    if (this.statusValue === 'idle') return;
    void this.releaseAndReconnect(`transport error: ${error.message}`, 'error');
  }

  // One path for every "this session is over" case, so the port is always
  // released before the next open attempt and never blocks it indefinitely.
  private async releaseAndReconnect(
    reason: string,
    severity: 'warn' | 'error' = 'warn',
  ): Promise<void> {
    if (this.stopping) return;
    this.options.logger[severity](reason);
    this.setStatus('reconnecting');
    await this.closeTransport();
    this.scheduleReconnect();
  }

  private async closeTransport(): Promise<void> {
    try {
      await withTimeout(this.options.transport.close(), CLOSE_TIMEOUT_MS, 'transport close');
    } catch (error) {
      this.options.logger.warn(`transport close failed: ${(error as Error).message}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    if (!this.autoTimers || this.reconnectTimer !== null) return;
    const delays = this.options.config.reconnectDelaysMs;
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)] ?? 15000;
    ++this.reconnectAttempt;
    this.options.logger.info(`reconnect in ${delay} ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openTransport();
    }, delay);
    this.reconnectTimer.unref();
  }

  private onData(chunk: Buffer): void {
    const framed = this.framer.push(chunk);
    if (framed.overflows > 0) {
      this.options.logger.warn('oversized line discarded');
      this.sendError('E_TOO_LONG', false, 'line too long');
    }
    for (const line of framed.lines) {
      const result = validateLine(line);
      if (!result.ok) {
        this.options.logger.warn(`invalid message code=${result.code}`);
        this.sendError(result.code, result.code === 'E_VERSION', result.detail);
        continue;
      }
      this.options.logger.protocol('in', result.message.type, result.message.seq, Buffer.byteLength(line));
      this.receivedCounts[result.message.type] = (this.receivedCounts[result.message.type] ?? 0) + 1;
      this.handleMessage(result.message);
    }
  }

  private handleMessage(message: AnyMessage): void {
    const now = this.now();
    this.lastRxMs = now;

    if (message.type === 'hello') {
      const major = negotiateMajor(message.data.proto, PROTOCOL_MAJOR);
      if (major === null) {
        this.sendError('E_VERSION', true, 'no common protocol major');
        this.setStatus('error');
        return;
      }
      // The device re-announces while it has no bridge session, so a port opened
      // late can flush several buffered `hello` frames at once. Answering each
      // with a full snapshot produced a burst that overran the device RX buffer
      // (seen on hardware as E_PARSE + resync). Same boot counter right after
      // the handshake means the same session: acknowledge nothing and skip it.
      if (
        (this.statusValue === 'ready' || this.statusValue === 'degraded') &&
        message.data.boot === this.deviceBoot &&
        now - this.lastHandshakeMs < 2000
      ) {
        this.options.logger.debug(`duplicate hello boot=${message.data.boot} ignored`);
        return;
      }
      this.deviceBoot = message.data.boot;
      this.lastHandshakeMs = now;
      this.seqOut.reset();
      this.deviceSeq.reset();
      this.deviceSeq.accept(message.seq);
      this.setStatus('ready');
      this.sendReady();
      this.sendConfig();
      // The snapshot is deferred to the next tick: sending ready, config, state,
      // mcp_status and ack back-to-back is ~1.1 KB, which exceeds the device's
      // 1024-byte CDC RX queue while it renders a frame (one lost frame per
      // connection was observed on hardware).
      this.snapshotPending = true;
      this.dirty = true;
      this.sendAck(message.seq);
      return;
    }

    if (this.statusValue !== 'ready' && this.statusValue !== 'degraded') {
      this.options.logger.warn(`message before handshake type=${message.type}`);
      return;
    }

    const action = this.deviceSeq.accept(message.seq);
    if (action === 'duplicate') {
      this.sendAck(message.seq);
      return;
    }
    if (action === 'stale') {
      this.options.logger.warn(`stale sequence seq=${message.seq}`);
      return;
    }
    if (action === 'gap') {
      this.options.logger.warn(`sequence gap expected=${this.deviceSeq.lastSeq + 1} received=${message.seq}`);
      this.deviceSeq.acceptAfterResync(message.seq);
      this.deviceSeq.accept(message.seq);
    }

    if (this.statusValue === 'degraded') {
      this.setStatus('ready');
    }

    switch (message.type) {
      case 'heartbeat':
        return;
      case 'interaction':
        this.onInteraction?.(message.data.gesture, message.data.screen);
        this.sendAck(message.seq);
        return;
      case 'resync':
        this.options.logger.warn(`device resync reason=${message.data.reason}`);
        this.sendConfig();
        this.snapshotPending = true;
        this.dirty = true;
        this.sendAck(message.seq);
        return;
      case 'error':
        this.options.logger.error(`device error code=${message.data.code} fatal=${message.data.fatal}`);
        this.sendAck(message.seq);
        return;
      case 'ack': {
        const sentAt = this.pendingAcks.get(message.data.ack);
        if (sentAt !== undefined) {
          const latency = this.now() - sentAt;
          this.pendingAcks.delete(message.data.ack);
          ++this.ackCount;
          this.ackTotalMs += latency;
          if (latency > this.ackMaxMs) this.ackMaxMs = latency;
        }
        this.options.logger.debug(`ack received ack=${message.data.ack} warning=${message.data.warning ?? 'none'}`);
        return;
      }
      default:
        this.options.logger.warn(`unexpected message type=${message.type}`);
        return;
    }
  }

  tick(now: number): void {
    if (this.statusValue === 'handshaking' && now - this.lastOpenMs >= HANDSHAKE_TIMEOUT_MS) {
      void this.releaseAndReconnect(
        `handshake timeout after ${now - this.lastOpenMs} ms, no hello received`,
      );
      return;
    }
    if (this.statusValue === 'ready' && now - this.lastRxMs > this.options.config.linkTimeoutMs) {
      this.setStatus('degraded');
      this.emitState(true);
    }
    if (this.statusValue === 'ready' && this.snapshotPending) {
      this.snapshotPending = false;
      this.emitState(true);
    }
    if (this.statusValue !== 'ready') return;

    if (now - this.lastHeartbeatMs >= this.options.config.heartbeatMs) {
      this.lastHeartbeatMs = now;
      this.send({ v: 1, type: 'heartbeat', seq: this.seqOut.next() });
    }
    if (this.dirty || now - this.lastStateMs >= this.options.config.stateIntervalMs) {
      this.emitState(false);
    }
  }

  private send(message: AnyMessage): void {
    let line: string;
    try {
      line = encodeMessage(message);
    } catch (error) {
      this.options.logger.error(`encode failed: ${(error as Error).message}`);
      return;
    }
    this.options.logger.protocol('out', message.type, message.seq, Buffer.byteLength(line));
    this.sentCounts[message.type] = (this.sentCounts[message.type] ?? 0) + 1;
    if (message.type === 'state' || message.type === 'mcp_status') {
      this.pendingAcks.set(message.seq, this.now());
      if (this.pendingAcks.size > 128) {
        const oldest = this.pendingAcks.keys().next();
        if (!oldest.done) this.pendingAcks.delete(oldest.value);
      }
    }
    void this.options.transport.write(`${line}\n`).catch((error: Error) => {
      this.options.logger.error(`write failed: ${error.message}`);
    });
  }

  private sendReady(): void {
    this.send({
      v: 1,
      type: 'ready',
      seq: this.seqOut.next(),
      data: {
        bridge: this.bridgeVersion,
        proto: PROTOCOL_MAJOR,
        run: randomUUID().replace(/-/g, '').slice(0, 8),
      },
    });
  }

  private sendConfig(): void {
    const config: ConfigData = {
      language: 'en',
      quietMode: false,
      autoReturnSeconds: 60,
      gestures: { ...DEFAULT_GESTURES },
      source: this.options.config.source,
    };
    this.send({ v: 1, type: 'config', seq: this.seqOut.next(), data: config });
  }

  private sendAck(ack: number): void {
    this.send({ v: 1, type: 'ack', seq: this.seqOut.next(), data: { ack, warning: null } });
  }

  private sendError(code: ErrorCode, fatal: boolean, detail: string): void {
    this.send({
      v: 1,
      type: 'error',
      seq: this.seqOut.next(),
      data: { code, fatal, detail: detail.slice(0, 48) },
    });
  }

  private emitState(force: boolean): void {
    if (this.statusValue !== 'ready' && !force) {
      return;
    }
    const now = this.now();
    const context = {
      now,
      bridge: this.statusValue === 'ready' ? ('ready' as const) : ('degraded' as const),
      source: this.options.config.source,
      bridgeVersion: this.bridgeVersion,
      protocol: PROTOCOL_MAJOR,
    };
    const state = this.privacy.projectState(this.registry.snapshot(context));
    this.send({ v: 1, type: 'state', seq: this.seqOut.next(), data: state });
    const mcp = this.privacy.projectMcp(this.registry.mcpStatus(this.options.config.source));
    this.send({ v: 1, type: 'mcp_status', seq: this.seqOut.next(), data: mcp });
    this.lastStateMs = now;
    this.dirty = false;
    this.onState?.(state);
    this.onMcpStatus?.(mcp);
  }
}
