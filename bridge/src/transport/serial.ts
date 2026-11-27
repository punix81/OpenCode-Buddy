import type { Transport, TransportErrorKind, TransportHandlers } from './types.js';
import { TransportError } from './types.js';

export interface SerialTransportOptions {
  path: string;
  baudRate: number;
}

function kindFromError(error: unknown): TransportErrorKind {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'permission';
  if (code === 'EBUSY' || code === 'EAGAIN') return 'busy';
  if (code === 'ENOENT' || code === 'ENODEV') return 'absent';
  return 'io';
}

// Persistent serial connection. The port is opened once and kept open; opening
// it resets the ESP32-C3 on this hardware, so the bridge must never reopen it
// per message.
export class SerialTransport implements Transport {
  private port: import('serialport').SerialPort | null = null;
  private handlers: TransportHandlers = {};

  constructor(private readonly options: SerialTransportOptions) {}

  setHandlers(handlers: TransportHandlers): void {
    this.handlers = handlers;
  }

  async open(): Promise<void> {
    const { SerialPort } = await import('serialport');
    const port = new SerialPort({
      path: this.options.path,
      baudRate: this.options.baudRate,
      autoOpen: false,
      lock: true,
      // The Windows SerialPort binding uses hupcl to enable DTR on open.
      // Keep DTR disabled on native USB; leave the Unix line policy intact.
      ...(process.platform === 'win32' ? { hupcl: false } : {}),
    });
    this.port = port;
    port.on('data', (data: Buffer) => this.handlers.onData?.(data));
    port.on('error', (error: Error) => this.handlers.onError?.(error));
    port.on('close', () => this.handlers.onClose?.());

    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error) {
          reject(new TransportError(`cannot open ${this.options.path}`, kindFromError(error), { cause: error }));
          return;
        }
        resolve();
      });
    });

    // Do not touch DTR/RTS. The Phase 1 finding was "never toggle per message",
    // and on this native USB CDC port `set({dtr,rts})` is not supported at all:
    // it rejects and emits an error event (observed on hardware), which the
    // bridge would otherwise read as a link failure.
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      const port = this.port;
      this.port = null;
      if (port === null || !port.isOpen) {
        resolve();
        return;
      }
      port.close(() => resolve());
    });
  }

  isOpen(): boolean {
    return this.port !== null && this.port.isOpen;
  }

  write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.port;
      if (port === null || !port.isOpen) {
        reject(new TransportError('serial port is closed', 'io'));
        return;
      }
      port.write(data, (error) => (error ? reject(error) : resolve()));
    });
  }
}
