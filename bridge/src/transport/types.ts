export interface TransportHandlers {
  onData?: (chunk: Buffer) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export type TransportErrorKind = 'absent' | 'busy' | 'permission' | 'protocol' | 'io';

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly kind: TransportErrorKind,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'TransportError';
  }
}

export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
  isOpen(): boolean;
  setHandlers(handlers: TransportHandlers): void;
}
