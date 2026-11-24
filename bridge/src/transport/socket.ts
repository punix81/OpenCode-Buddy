import { connect, type Socket } from 'node:net';

import type { Transport, TransportHandlers } from './types.js';

export interface SocketTransportOptions {
  host?: string;
  port: number;
  timeoutMs?: number;
}

// Loopback-only socket transport, used by the simulator and integration tests.
export class SocketTransport implements Transport {
  private socket: Socket | null = null;
  private handlers: TransportHandlers = {};
  private readonly host: string;

  constructor(private readonly options: SocketTransportOptions) {
    this.host = options.host ?? '127.0.0.1';
    if (this.host !== '127.0.0.1' && this.host !== '::1' && this.host !== 'localhost') {
      throw new Error('SocketTransport is loopback-only');
    }
  }

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.options.port });
      this.socket = socket;
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('socket connection timed out'));
      }, this.options.timeoutMs ?? 3000);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setNoDelay(true);
        resolve();
      });
      socket.on('data', (data: Buffer) => this.handlers.onData?.(data));
      socket.on('error', (error: Error) => {
        clearTimeout(timer);
        this.handlers.onError?.(error);
        reject(error);
      });
      socket.on('close', () => this.handlers.onClose?.());
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      const socket = this.socket;
      this.socket = null;
      if (socket === null) {
        resolve();
        return;
      }
      socket.end(() => resolve());
      socket.destroy();
    });
  }

  isOpen(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen()) {
        reject(new Error('socket is closed'));
        return;
      }
      this.socket?.write(data, (error) => (error ? reject(error) : resolve()));
    });
  }
}
