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
  // Called before every reconnection attempt. The USB device can re-enumerate
  // under a different port name, so the transport (and its discovery) must be
  // rebuilt instead of reopening the stale path forever.
  transportFactory?: () => Promise<Transport>;
  // Delay between hello and the first ready/config write. USB CDC devices can
  // drop the first frame when the host writes during their boot; the CLI uses a
  // short delay, tests keep the default zero.
  handshakeDelayMs?: number;
  // Read and discard the frames a device buffered while no host was reading
  // before writing the handshake. A long TX backlog can leave the CDC RX
  // endpoint unresponsive (Phase 4 hardware); tests keep the default zero.
  linkSettleMs?: number;
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

// A booting ESP32-C3 can lose the first ready/config when its CDC RX still
// holds a fragment of its own transmission. Both frames are idempotent when
// replayed with ready seq 1, which restarts the device's peer sequence. Retry
// before giving up on the session; the 7 s timeout below stays the last resort.
export const HANDSHAKE_RETRY_MS = 2000;
export const HANDSHAKE_MAX_RETRIES = 3;

// A half-open CDC fd never reports close, so `transport.close()` can hang. Bound
// it: shutdown and reconnection must always make progress.
export const CLOSE_TIMEOUT_MS = 2000;
// A frame the device never acknowledged is reported and forgotten; the periodic
// snapshot re-sends the state, so there is nothing to retransmit blindly.
export const ACK_TIMEOUT_MS = 10000;

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
  private readonly handshakeDelayMs: number;
  private readonly linkSettleMs: number;
  private readonly runId = randomUUID().replace(/-/g, '').slice(0, 8);
  private handshakeAt: number | null = null;
  private handshakeHelloSeq = 0;
  private readonly autoTimers: boolean;
  private transport: Transport;

  private readonly sentCounts: Record<string, number> = {};
  private readonly receivedCounts: Record<string, number> = {};
  private readonly pendingAcks = new Map<number, number>();
  private ackCount = 0;
  private ackTotalMs = 0;
  private ackMaxMs = 0;
  private expiredAcks = 0;

  private statusValue: BridgeStatus = 'idle';
  private lastRxMs = 0;
  private lastHeartbeatMs = 0;
  private lastStateMs = 0;
  private lastHandshakeMs = 0;
  private lastOpenMs = 0;
  private deviceBoot = -1;
  private deviceCaps = new Set<string>();
  private snapshotPending = false;
  private mcpDue = false;
  private lastMcpKey: string | null = null;
  private handshakeAcked = false;
  private handshakeRetryAt: number | null = null;
  private handshakeRetries = 0;
  private opencodeVersion: string | null = null;
  private handshakeReadySeq: number | null = null;
  private handshakeConfigSeq: number | null = null;
  private handshakeReadyAcked = false;
  private handshakeConfigAcked = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopping = false;

  onState?: (state: StateData) => void;
  onMcpStatus?: (status: McpStatusData) => void;
  onInteraction?: (gesture: string, screen: number) => void;
  onStatus?: (status: BridgeStatus) => void;

  constructor(private readonly options: BridgeOptions) {
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.bridgeVersion = options.bridgeVersion ?? '0.2.0';
    this.autoTimers = options.autoTimers ?? true;
    this.handshakeDelayMs = Math.max(0, options.handshakeDelayMs ?? 0);
    this.linkSettleMs = Math.max(0, options.linkSettleMs ?? 0);
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
    expiredAcks: number;
  } {
    return {
      sent: { ...this.sentCounts },
      received: { ...this.receivedCounts },
      ackLatency: {
        count: this.ackCount,
        avgMs: this.ackCount === 0 ? 0 : Math.round(this.ackTotalMs / this.ackCount),
        maxMs: this.ackMaxMs,
      },
      expiredAcks: this.expiredAcks,
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
    this.transport.setHandlers({
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
    return true;
  }

  // The OpenCode peer reports its version in the IPC hello. `null` clears it
  // when no peer is connected so the System screen never shows a stale value.
  setOpenCodeVersion(version: string | null): void {
    this.opencodeVersion = version;
  }

  private async openTransport(): Promise<void> {
    this.setStatus('opening');
    try {
      if (this.reconnectAttempt > 0 && this.options.transportFactory !== undefined) {
        this.transport = await this.options.transportFactory();
        this.transport.setHandlers({
          onData: (chunk) => this.onData(chunk),
          onError: (error) => this.onError(error),
          onClose: () => this.onClose(),
        });
      }
      // Reset before opening: a device that already re-enumerated can announce
      // itself the instant the port accepts data, and that hello must not be
      // erased by a reset performed after open() resolves.
      this.framer.reset();
      this.seqOut.reset();
      this.deviceSeq.reset();
      this.deviceBoot = -1;
      this.lastHandshakeMs = 0;
      this.handshakeRetryAt = null;
      this.handshakeRetries = 0;
      await this.transport.open();
      this.lastRxMs = this.now();
      this.lastOpenMs = this.lastRxMs;
      this.reconnectAttempt = 0;
      if (this.statusValue !== 'ready') this.setStatus('handshaking');
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
      await withTimeout(this.transport.close(), CLOSE_TIMEOUT_MS, 'transport close');
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
    // Before the handshake a malformed line is normally the tail of a frame the
    // device was already writing when the port opened. Sending an error back
    // adds a pre-handshake sequence that the device must resync around; log it
    // and let the device's hello establish the session (observed on the Phase 4
    // flash as an avoidable error/resync pair).
    const reportErrors = this.statusValue === 'ready' || this.statusValue === 'degraded';
    if (framed.overflows > 0) {
      this.options.logger.warn('oversized line discarded');
      if (reportErrors) this.sendError('E_TOO_LONG', false, 'line too long');
    }
    for (const line of framed.lines) {
      const result = validateLine(line);
      if (!result.ok) {
        this.options.logger.warn(`invalid message code=${result.code}`);
        if (reportErrors) this.sendError(result.code, result.code === 'E_VERSION', result.detail);
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

    if (this.linkSettleMs > 0 &&
        (this.statusValue === 'opening' || this.statusValue === 'handshaking') &&
        now - this.lastOpenMs < this.linkSettleMs) {
      this.options.logger.debug(`link settling, ignoring ${message.type}`);
      return;
    }

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
        (!this.handshakeAcked || now - this.lastHandshakeMs < 2000)
      ) {
        this.options.logger.debug(`duplicate hello boot=${message.data.boot} ignored`);
        return;
      }
      this.deviceBoot = message.data.boot;
      this.deviceCaps = new Set(message.data.caps ?? []);
      this.options.logger.debug(
        `hello boot=${message.data.boot} caps=${[...this.deviceCaps].join(',') || '-'}`,
      );
      this.lastHandshakeMs = now;
      this.seqOut.reset();
      this.deviceSeq.reset();
      this.pendingAcks.clear();
      this.handshakeAcked = false;
      this.handshakeReadyAcked = false;
      this.handshakeConfigAcked = false;
      this.handshakeReadySeq = null;
      this.handshakeConfigSeq = null;
      this.deviceSeq.accept(message.seq);
      this.setStatus('ready');
      if (this.handshakeDelayMs > 0) {
        this.handshakeAt = now + this.handshakeDelayMs;
        this.handshakeHelloSeq = message.seq;
      } else {
        this.beginHandshake(message.seq);
      }
      return;
    }

    if (this.statusValue !== 'ready' && this.statusValue !== 'degraded') {
      this.options.logger.warn(`message before handshake type=${message.type}`);
      return;
    }

    const action = this.deviceSeq.accept(message.seq);
    if (action === 'duplicate') {
      // Heartbeats are never acknowledged; doing so for a buffered burst of
      // duplicate heartbeats consumed the outbound sequence and could overflow
      // the device RX queue before ready/config (observed on hardware boot).
      if (message.type !== 'heartbeat') this.sendAck(message.seq);
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
        this.options.logger.warn(
          `device resync reason=${message.data.reason} expected=${message.data.expected ?? '-'} received=${message.data.received ?? '-'}`,
        );
        if (message.data.expected !== undefined) {
          // The device tells us the next peer sequence it expects; adopt it so a
          // lost frame cannot turn the resync into an endless loop.
          this.seqOut.setNext(message.data.expected);
        }
        // A booting device can lose the first CDC frame (observed after a USB
        // replug: ready was lost, config arrived, the device resynced at
        // expected=1). Re-send ready when the device has not passed the
        // handshake yet; config alone would leave ready_ false forever.
        this.handshakeAt = null;
        this.handshakeReadyAcked = false;
        this.handshakeConfigAcked = false;
        const expected = message.data.expected;
        if (expected !== undefined && expected >= 1 && expected <= 2) {
          this.handshakeReadySeq = this.sendReady();
        }
        this.handshakeConfigSeq = this.sendConfig();
        this.snapshotPending = true;
        this.sendAck(message.seq);
        return;
      case 'error':
        this.options.logger.error(
          `device error code=${message.data.code} fatal=${message.data.fatal} detail=${message.data.detail ?? '-'}`,
        );
        this.sendAck(message.seq);
        return;
      case 'ack': {
        // A single ACK must not declare the handshake complete: ready may be
        // applied while config was lost, which would leave the device without
        // auto-return or an explicit override. Require both frames of the
        // current attempt; a delayed ACK for a replay has the same seq/content.
        if (this.handshakeReadySeq !== null && message.data.ack === this.handshakeReadySeq) {
          this.handshakeReadyAcked = true;
        }
        if (this.handshakeConfigSeq !== null && message.data.ack === this.handshakeConfigSeq) {
          this.handshakeConfigAcked = true;
        }
        if (this.handshakeReadyAcked && this.handshakeConfigAcked) {
          // The device has processed ready and config: it is safe to send the
          // snapshot. A device still booting may miss the handshake and
          // re-announce; sending state first used to provoke E_PARSE/resync.
          this.handshakeAcked = true;
          this.handshakeRetryAt = null;
        }
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
    if (this.handshakeAt !== null) {
      if (now < this.handshakeAt) return;
      this.handshakeAt = null;
      this.beginHandshake(this.handshakeHelloSeq);
    }
    if (this.handshakeRetryAt !== null) {
      if (this.handshakeAcked) {
        this.handshakeRetryAt = null;
      } else if (now >= this.handshakeRetryAt) {
        if (this.statusValue === 'ready' && this.handshakeRetries < HANDSHAKE_MAX_RETRIES) {
          ++this.handshakeRetries;
          this.options.logger.warn(`handshake retry ${this.handshakeRetries} (no ACK)`);
          // ready seq 1 restarts the device's peer sequence, so the replay is
          // accepted even when the first attempt already advanced it.
          this.sendHandshakePair();
          this.handshakeRetryAt = now + HANDSHAKE_RETRY_MS;
        } else {
          this.handshakeRetryAt = null;
        }
      }
    }
    for (const [seq, sentAt] of this.pendingAcks) {
      if (now - sentAt <= ACK_TIMEOUT_MS) continue;
      this.pendingAcks.delete(seq);
      ++this.expiredAcks;
      this.options.logger.warn(`ack timeout seq=${seq}`);
    }
    if (this.statusValue === 'handshaking' && now - this.lastOpenMs >= HANDSHAKE_TIMEOUT_MS) {
      void this.releaseAndReconnect(
        `handshake timeout after ${now - this.lastOpenMs} ms, no hello received`,
      );
      return;
    }
    if (this.statusValue === 'ready' && !this.handshakeAcked &&
        now - this.lastHandshakeMs >= HANDSHAKE_TIMEOUT_MS) {
      // A hello arrived but ready/config were never acknowledged. This is the
      // signature of a device whose CDC RX did not come up; reopen the port,
      // which resets the board and gives the next boot a chance instead of
      // waiting forever.
      void this.releaseAndReconnect(
        `handshake not acknowledged after ${now - this.lastHandshakeMs} ms`,
      );
      return;
    }
    if (this.statusValue === 'ready' && this.handshakeAcked &&
        now - this.lastRxMs > this.options.config.linkTimeoutMs) {
      this.setStatus('degraded');
      this.emitState(true);
    }
    // Never heartbeat before the device's hello: the installed firmware keeps
    // `lastRxMs` alive on any bridge frame, so a pre-handshake heartbeat would
    // prevent its 6 s timeout from firing and it would never re-announce. A
    // restart then looped on the bridge's 7 s handshake timeout.
    if (this.statusValue === 'ready' &&
        now - this.lastHeartbeatMs >= this.options.config.heartbeatMs) {
      this.lastHeartbeatMs = now;
      this.send({ v: 1, type: 'heartbeat', seq: this.seqOut.next() });
    }
    if (this.statusValue !== 'ready') return;

    if (this.snapshotPending && this.handshakeAcked) {
      this.snapshotPending = false;
      this.emitState(true);
    } else if (this.mcpDue) {
      // Send the MCP detail on its own tick. With eight servers the state and
      // mcp frames together exceed the device's 1024-byte RX queue while it
      // renders, which produced E_PARSE + resync on the live link.
      this.sendMcp();
    } else if (this.handshakeAcked && now - this.lastStateMs >= this.options.config.stateIntervalMs) {
      // Respect the configured snapshot cadence. Sending on every tick made the
      // bridge emit ~10 state frames per second under load, which overflowed the
      // device RX queue during rendering (Phase 3.1 stress soak).
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
    void this.transport.write(`${line}\n`).catch((error: Error) => {
      this.options.logger.error(`write failed: ${error.message}`);
    });
  }

  private beginHandshake(helloSeq: number): void {
    // The first CDC write after a port open can be consumed by the device's
    // USB-CDC endpoint setup. A blank line is ignored by its line framer and
    // primes the endpoint before ready/config.
    this.primeLink();
    this.sendHandshakePair();
    // The snapshot is deferred to the next tick: sending ready, config, state,
    // mcp_status and ack back-to-back is ~1.1 KB, which exceeds the device's
    // 1024-byte CDC RX queue while it renders a frame (one lost frame per
    // connection was observed on hardware).
    this.snapshotPending = true;
    this.sendAck(helloSeq);
    this.handshakeRetries = 0;
    this.handshakeRetryAt = this.now() + HANDSHAKE_RETRY_MS;
  }

  private primeLink(): void {
    void this.transport.write('\n').catch((error: Error) => {
      this.options.logger.error(`prime write failed: ${error.message}`);
    });
  }

  // Sends ready and config as one attempt: ready restarts at seq 1 so a replay
  // is accepted, and both ACKs are required before the snapshot is released.
  private sendHandshakePair(): void {
    this.seqOut.reset();
    this.handshakeReadyAcked = false;
    this.handshakeConfigAcked = false;
    this.handshakeReadySeq = this.sendReady();
    this.handshakeConfigSeq = this.sendConfig();
  }

  private sendReady(): number {
    const seq = this.seqOut.next();
    this.send({
      v: 1,
      type: 'ready',
      seq,
      data: {
        bridge: this.bridgeVersion,
        proto: PROTOCOL_MAJOR,
        run: this.runId,
      },
    });
    return seq;
  }

  private sendConfig(): number {
    // An explicit host override always wins. Without one, a firmware that
    // supports partial config keeps its stored preference; an older firmware
    // rejects a config without these fields, so the legacy values are sent.
    const partial = this.deviceCaps.has('config.partial');
    const language = this.options.config.language ?? (partial ? null : 'en');
    const quietMode = this.options.config.quietMode ?? (partial ? null : false);
    const config: ConfigData = {
      autoReturnSeconds: this.options.config.autoReturnSeconds,
      gestures: { ...DEFAULT_GESTURES },
      source: this.options.config.source,
      ...(language !== null ? { language } : {}),
      ...(quietMode !== null ? { quietMode } : {}),
    };
    const seq = this.seqOut.next();
    this.send({ v: 1, type: 'config', seq, data: config });
    return seq;
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
      opencodeVersion: this.opencodeVersion,
    };
    const state = this.privacy.projectState(this.registry.snapshot(context));
    // An older firmware rejects unknown keys in `versions`; only a device that
    // advertised the capability receives the optional OpenCode version.
    if (!this.deviceCaps.has('state.opencodeVersion')) {
      delete state.versions.opencode;
    }
    this.send({ v: 1, type: 'state', seq: this.seqOut.next(), data: state });
    this.lastStateMs = now;
    this.onState?.(state);

    const mcp = this.privacy.projectMcp(this.registry.mcpStatus(this.options.config.source));
    const key = JSON.stringify(mcp);
    if (force || key !== this.lastMcpKey) {
      this.mcpDue = true;
    }
  }

  private sendMcp(): void {
    const mcp = this.privacy.projectMcp(this.registry.mcpStatus(this.options.config.source));
    this.send({ v: 1, type: 'mcp_status', seq: this.seqOut.next(), data: mcp });
    this.mcpDue = false;
    this.lastMcpKey = JSON.stringify(mcp);
    this.onMcpStatus?.(mcp);
  }
}
