import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';

import type { Logger } from '../logger.js';
import type { IpcPaths } from './paths.js';
import { IPC_MAX_LINE_BYTES, parseIpcLine, type IpcHello } from './messages.js';

export const IPC_HELLO_TIMEOUT_MS = 2000;
export const IPC_RATE_PER_SECOND = 200;
export const IPC_RATE_BURST = 400;
export const IPC_TOKEN_BYTES = 32;
// One authenticated connection per OpenCode location (project). More than that is
// a runaway, not a user.
export const IPC_MAX_CONNECTIONS = 8;

export interface IpcServerOptions {
  paths: IpcPaths;
  logger: Logger;
  onHello: (peer: number, hello: IpcHello) => void;
  onEvent: (peer: number, raw: Record<string, unknown>) => void;
  onHeartbeat: (peer: number) => void;
  onDisconnect: (peer: number) => void;
}

interface Peer {
  id: number;
  socket: Socket;
  authenticated: boolean;
  tokens: number;
  lastRefill: number;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

// Local-only event intake for the OpenCode plugin.
//
// Access control has two layers, both required:
//   1. filesystem: the directory is 0700 and the socket 0600, so only the owning
//      user (or root) can connect at all;
//   2. a 256-bit token, written to a 0600 file inside that directory and checked
//      in the first frame with a constant-time comparison.
// Node and Bun expose no portable SO_PEERCRED, so the token is the second layer
// that works on every platform. See docs/security.md.
export class IpcServer {
  private readonly server: Server;
  private readonly token: string;
  private readonly peers = new Map<number, Peer>();
  private nextPeerId = 1;
  private closed = false;

  constructor(private readonly options: IpcServerOptions) {
    this.token = randomBytes(IPC_TOKEN_BYTES).toString('hex');
    this.server = createServer((socket) => this.accept(socket));
  }

  get socketPath(): string {
    return this.options.paths.socket;
  }

  get connectionCount(): number {
    return this.peers.size;
  }

  async start(): Promise<void> {
    const { dir, socket, tokenFile } = this.options.paths;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    writeFileSync(tokenFile, `${this.token}\n`, { mode: 0o600 });
    chmodSync(tokenFile, 0o600);

    // A socket left behind by a crashed bridge would block listen().
    try {
      rmSync(socket, { force: true });
    } catch {
      // Ignored: listen() reports a real problem with a useful error.
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.server.once('error', onError);
      this.server.listen(socket, () => {
        this.server.off('error', onError);
        chmodSync(socket, 0o600);
        resolve();
      });
    });

    this.options.logger.info(`ipc listening path=${socket}`);
  }

  async stop(): Promise<void> {
    this.closed = true;
    for (const peer of this.peers.values()) peer.socket.destroy();
    this.peers.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    try {
      rmSync(this.options.paths.socket, { force: true });
      rmSync(this.options.paths.tokenFile, { force: true });
    } catch {
      // Best effort: the directory is ours and 0700.
    }
  }

  private accept(socket: Socket): void {
    if (this.closed || this.peers.size >= IPC_MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }

    const peer: Peer = {
      id: this.nextPeerId++,
      socket,
      authenticated: false,
      tokens: IPC_RATE_BURST,
      lastRefill: Date.now(),
    };
    this.peers.set(peer.id, peer);

    let buffer = '';
    const reject = (reason: string): void => {
      this.options.logger.warn(`ipc rejected reason=${reason}`);
      socket.destroy();
    };

    const helloTimer = setTimeout(() => {
      if (!peer.authenticated) reject('hello_timeout');
    }, IPC_HELLO_TIMEOUT_MS);
    helloTimer.unref();

    socket.setNoDelay(true);
    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      const now = Date.now();
      peer.tokens = Math.min(
        IPC_RATE_BURST,
        peer.tokens + ((now - peer.lastRefill) / 1000) * IPC_RATE_PER_SECOND,
      );
      peer.lastRefill = now;

      buffer += chunk;
      if (buffer.length > IPC_MAX_LINE_BYTES * 4) {
        reject('buffer_overflow');
        return;
      }

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');

        if (line.length === 0) continue;
        if (line.length > IPC_MAX_LINE_BYTES) {
          reject('line_too_long');
          return;
        }
        if (peer.tokens < 1) {
          reject('rate_limited');
          return;
        }
        --peer.tokens;
        if (!this.handleLine(peer, line)) return;
      }
    });

    socket.on('error', (error: Error) => {
      this.options.logger.warn(`ipc socket error: ${error.message}`);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      this.peers.delete(peer.id);
      if (peer.authenticated) this.options.onDisconnect(peer.id);
    });
  }

  private handleLine(peer: Peer, line: string): boolean {
    const parsed = parseIpcLine(line);
    if (!parsed.ok) {
      this.options.logger.warn(`ipc dropped reason=${parsed.reason}`);
      return true;
    }
    const message = parsed.message;

    if (!peer.authenticated) {
      if (message.type !== 'hello') {
        peer.socket.destroy();
        return false;
      }
      if (!constantTimeEquals(message.token, this.token)) {
        this.options.logger.warn('ipc rejected reason=bad_token');
        peer.socket.destroy();
        return false;
      }
      peer.authenticated = true;
      this.options.onHello(peer.id, message.hello);
      return true;
    }

    switch (message.type) {
      case 'event':
        this.options.onEvent(peer.id, message.raw);
        return true;
      case 'heartbeat':
        this.options.onHeartbeat(peer.id);
        return true;
      default:
        return true;
    }
  }
}
