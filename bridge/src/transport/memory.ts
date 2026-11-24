import type { Transport, TransportHandlers } from './types.js';

// In-memory transport used by tests and by the simulator. Each write is
// delivered asynchronously to the peer, which makes it behave like a real
// stream without opening a port.
export class MemoryTransport implements Transport {
  private handlers: TransportHandlers = {};
  private openState = false;
  private peer: MemoryTransport | null = null;

  static pair(): [MemoryTransport, MemoryTransport] {
    const a = new MemoryTransport();
    const b = new MemoryTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }

  async open(): Promise<void> {
    this.openState = true;
  }

  async close(): Promise<void> {
    if (!this.openState) {
      return;
    }
    this.openState = false;
    this.handlers.onClose?.();
  }

  isOpen(): boolean {
    return this.openState;
  }

  async write(data: string): Promise<void> {
    const peer = this.peer;
    if (!this.openState || peer === null || !peer.openState) {
      throw new Error('transport is closed');
    }
    const chunk = Buffer.from(data, 'utf8');
    queueMicrotask(() => peer.handlers.onData?.(chunk));
  }
}
