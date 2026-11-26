import type { Logger } from '../logger.js';
import type { ConfigData, McpStatusData, StateData } from '../protocol/types.js';
import { LineFramer, OutboundSequence, SequenceTracker, encodeMessage } from '../protocol/codec.js';
import { validateLine } from '../protocol/validator.js';
import type { Transport } from '../transport/types.js';

export type SimulatorStatus = 'idle' | 'handshaking' | 'ready';

export interface SimulatorOptions {
  transport: Transport;
  logger: Logger;
  autoTimers?: boolean;
  heartbeatMs?: number;
  firmwareVersion?: string;
  bootCount?: number;
  protocols?: number[];
  caps?: string[];
}

// Device-side simulator: speaks the ratified protocol over any transport. It is
// used by the tests and by the CLI to exercise the bridge without hardware.
export class Simulator {
  private readonly framer = new LineFramer();
  private readonly seq = new OutboundSequence();
  private readonly bridgeSeq = new SequenceTracker();
  private readonly autoTimers: boolean;
  private readonly heartbeatMs: number;
  private readonly firmwareVersion: string;
  private readonly bootCount: number;
  private readonly protocols: number[];
  private readonly caps: string[];

  statusValue: SimulatorStatus = 'idle';
  lastState: StateData | null = null;
  lastConfig: ConfigData | null = null;
  lastMcp: McpStatusData | null = null;
  onState?: (state: StateData) => void;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat = 0;

  constructor(private readonly options: SimulatorOptions) {
    this.autoTimers = options.autoTimers ?? true;
    this.heartbeatMs = options.heartbeatMs ?? 2000;
    this.firmwareVersion = options.firmwareVersion ?? '0.2.0';
    this.bootCount = options.bootCount ?? 1;
    this.protocols = options.protocols ?? [1];
    this.caps = options.caps ?? [];
  }

  async start(): Promise<void> {
    this.options.transport.setHandlers({
      onData: (chunk) => this.onData(chunk),
      onError: (error) => this.options.logger.error(`simulator transport: ${error.message}`),
      onClose: () => {},
    });
    await this.options.transport.open();
    this.seq.reset();
    this.bridgeSeq.reset();
    this.sendHello();
    this.statusValue = 'handshaking';
    if (this.autoTimers) {
      this.heartbeatTimer = setInterval(() => this.tick(Date.now()), 100);
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    await this.options.transport.close();
  }

  tick(now: number): void {
    if (now - this.lastHeartbeat >= this.heartbeatMs) {
      this.lastHeartbeat = now;
      this.send({ v: 1, type: 'heartbeat', seq: this.seq.next() });
    }
  }

  sendInteraction(gesture: 'short' | 'double' | 'long' | 'very_long', screen: number): void {
    this.send({ v: 1, type: 'interaction', seq: this.seq.next(), data: { gesture, screen } });
  }

  sendResync(reason: 'seq_gap' | 'parse_error' | 'state_error' | 'boot' = 'seq_gap'): void {
    this.send({
      v: 1,
      type: 'resync',
      seq: this.seq.next(),
      data: { reason },
    });
  }

  private sendHello(): void {
    this.send({
      v: 1,
      type: 'hello',
      seq: this.seq.next(),
      data: {
        device: 'opencode-buddy',
        fw: this.firmwareVersion,
        proto: this.protocols,
        maxLine: 2048,
        boot: this.bootCount,
        ...(this.caps.length > 0 ? { caps: this.caps } : {}),
      },
    });
  }

  private send(message: Parameters<typeof encodeMessage>[0]): void {
    let line: string;
    try {
      line = encodeMessage(message);
    } catch (error) {
      this.options.logger.error(`simulator encode: ${(error as Error).message}`);
      return;
    }
    void this.options.transport.write(`${line}\n`).catch((error: Error) => {
      this.options.logger.error(`simulator write: ${error.message}`);
    });
  }

  private ack(seq: number): void {
    this.send({ v: 1, type: 'ack', seq: this.seq.next(), data: { ack: seq, warning: null } });
  }

  private onData(chunk: Buffer): void {
    const framed = this.framer.push(chunk);
    for (const line of framed.lines) {
      const result = validateLine(line);
      if (!result.ok) {
        this.options.logger.warn(`simulator invalid message code=${result.code}`);
        continue;
      }
      const message = result.message;
      const action = this.bridgeSeq.accept(message.seq);
      if (action === 'duplicate') {
        this.ack(message.seq);
        continue;
      }
      if (action === 'gap') {
        this.bridgeSeq.acceptAfterResync(message.seq);
        this.bridgeSeq.accept(message.seq);
      }
      if (action === 'stale') continue;

      switch (message.type) {
        case 'ready':
          this.statusValue = 'ready';
          this.ack(message.seq);
          break;
        case 'config':
          this.lastConfig = message.data;
          this.ack(message.seq);
          break;
        case 'state':
          this.lastState = message.data;
          this.onState?.(message.data);
          this.ack(message.seq);
          break;
        case 'mcp_status':
          this.lastMcp = message.data;
          this.ack(message.seq);
          break;
        case 'heartbeat':
          break;
        case 'error':
          this.options.logger.error(`simulator received error ${message.data.code}`);
          break;
        default:
          break;
      }
    }
  }
}
