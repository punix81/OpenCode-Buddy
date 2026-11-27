import { MAX_LINE_BYTES, PROTOCOL_MAJOR, type AnyMessage } from './types.js';

export class ProtocolEncodeError extends Error {}

export function encodeMessage(message: AnyMessage): string {
  const line = JSON.stringify(message);
  if (Buffer.byteLength(line, 'utf8') + 1 > MAX_LINE_BYTES) {
    throw new ProtocolEncodeError('message exceeds the line limit');
  }
  return line;
}

export interface FrameResult {
  lines: string[];
  // Overflows caused by this chunk only. A cumulative counter here made the
  // bridge report the same oversized line on every later chunk.
  overflows: number;
}

// Incremental NDJSON framer. Accepts arbitrary chunks, handles CRLF, several
// messages per chunk and a fragmented message. An oversized line is discarded
// up to the next newline and counted once.
export class LineFramer {
  private pending: Buffer = Buffer.alloc(0);
  private discarding = false;

  push(chunk: Buffer | string): FrameResult {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    this.pending = this.pending.length === 0 ? bytes : Buffer.concat([this.pending, bytes]);
    const lines: string[] = [];
    let overflows = 0;

    for (;;) {
      const newline = this.pending.indexOf(0x0a);
      if (newline < 0) {
        break;
      }
      const raw = this.pending.subarray(0, newline);
      this.pending = this.pending.subarray(newline + 1);

      if (this.discarding) {
        this.discarding = false;
        continue;
      }
      const withoutCr = raw.length > 0 && raw[raw.length - 1] === 0x0d ? raw.subarray(0, -1) : raw;
      if (withoutCr.length + 1 > MAX_LINE_BYTES) {
        ++overflows;
        continue;
      }
      if (withoutCr.length === 0) {
        continue;
      }
      lines.push(withoutCr.toString('utf8'));
    }

    if (!this.discarding && this.pending.length + 1 > MAX_LINE_BYTES) {
      this.pending = Buffer.alloc(0);
      this.discarding = true;
      ++overflows;
    }

    return { lines, overflows };
  }

  reset(): void {
    this.pending = Buffer.alloc(0);
    this.discarding = false;
  }
}

export type SequenceAction = 'apply' | 'duplicate' | 'stale' | 'gap';

export class SequenceTracker {
  private last = 0;

  reset(): void {
    this.last = 0;
  }

  get lastSeq(): number {
    return this.last;
  }

  accept(seq: number): SequenceAction {
    if (this.last === 0) {
      if (seq === 1) {
        this.last = 1;
        return 'apply';
      }
      return 'gap';
    }
    if (seq === this.last + 1) {
      this.last = seq;
      return 'apply';
    }
    if (seq === this.last) {
      return 'duplicate';
    }
    if (seq < this.last) {
      return 'stale';
    }
    return 'gap';
  }

  // Accepts the first message after a resynchronisation, then enforces order.
  acceptAfterResync(seq: number): void {
    if (seq > this.last) {
      this.last = seq - 1;
    }
  }
}

export class OutboundSequence {
  private value = 0;

  reset(): void {
    this.value = 0;
  }

  // Align the next outbound sequence with the value the device expects after a
  // resynchronisation. The device sends its expected next peer sequence.
  setNext(value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > 0x7fffffff) return;
    this.value = value - 1;
  }

  next(): number {
    ++this.value;
    if (this.value > 0x7fffffff) {
      this.value = 1;
    }
    return this.value;
  }
}

export function negotiateMajor(deviceMajors: readonly number[], bridgeMajor = PROTOCOL_MAJOR): number | null {
  if (!deviceMajors.includes(bridgeMajor)) {
    return null;
  }
  return bridgeMajor;
}
