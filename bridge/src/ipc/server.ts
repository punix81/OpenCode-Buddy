import { randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';

import type { Logger } from '../logger.js';
import type { IpcPaths } from './paths.js';
import { createIpcEndpoint, type IpcEndpoint } from './endpoint.js';
import { IPC_MAX_LINE_BYTES, parseIpcLine, type IpcHello } from './messages.js';
import { pidIsAlive, readLockOwner } from './lock.js';

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
  onSource?: (peer: number, status: 'ok' | 'degraded') => void;
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
//
// A second bridge must never replace the first one's token or socket: the lock
// file is acquired before any shared file is touched and released on stop.
export class IpcServer {
  private readonly server: Server;
  private readonly token: string;
  private readonly endpoint: IpcEndpoint;
  private readonly peers = new Map<number, Peer>();
  private nextPeerId = 1;
  private closed = false;
  private lockHeld = false;
  private started = false;

  constructor(private readonly options: IpcServerOptions) {
    this.token = randomBytes(IPC_TOKEN_BYTES).toString('hex');
    this.endpoint = createIpcEndpoint(this.options.paths, options.logger);
    this.server = createServer((socket) => this.accept(socket));
  }

  get socketPath(): string {
    return this.endpoint.address;
  }

  get connectionCount(): number {
    return this.peers.size;
  }

  private acquireLock(): void {
    const { lockFile } = this.options.paths;
    for (let attempt = 0; attempt < 2; ++attempt) {
      try {
        const fd = openSync(lockFile, 'wx', 0o600);
        try {
          writeSync(fd, `${process.pid}\n`);
        } finally {
          closeSync(fd);
        }
        this.lockHeld = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const pid = readLockOwner(lockFile);
        if (pid !== null && pidIsAlive(pid)) {
          throw new Error(`another bridge is running (pid ${pid})`);
        }
        // Stale lock from a crashed bridge: remove it and retry once.
        try {
          unlinkSync(lockFile);
        } catch {
          // The retry reports a real problem.
        }
      }
    }
    throw new Error('cannot acquire the bridge lock');
  }

  private releaseLock(): void {
    if (!this.lockHeld) return;
    this.lockHeld = false;
    try {
      const owner = readFileSync(this.options.paths.lockFile, 'utf8').trim();
      if (Number.parseInt(owner, 10) === process.pid) {
        unlinkSync(this.options.paths.lockFile);
      }
    } catch {
      // Already gone.
    }
  }

  async start(): Promise<void> {
    this.endpoint.ensureDirectory();
    this.acquireLock();
    try {
      this.endpoint.prepare(this.token);
      await this.endpoint.listen(this.server);
    } catch (error) {
      this.endpoint.cleanup();
      this.releaseLock();
      throw error;
    }
    this.started = true;
    this.options.logger.info(`ipc listening path=${this.endpoint.address}`);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      // A second instance that failed to start owns nothing: never remove the
      // live bridge's socket or token.
      this.releaseLock();
      return;
    }
    this.started = false;
    this.closed = true;
    for (const peer of this.peers.values()) peer.socket.destroy();
    this.peers.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.endpoint.cleanup();
    this.releaseLock();
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
      // Limits are defined in UTF-8 bytes, not in JavaScript UTF-16 code units.
      if (Buffer.byteLength(buffer, 'utf8') > IPC_MAX_LINE_BYTES * 4) {
        reject('buffer_overflow');
        return;
      }

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');

        if (line.length === 0) continue;
        if (Buffer.byteLength(line, 'utf8') > IPC_MAX_LINE_BYTES) {
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
      case 'source':
        this.options.onSource?.(peer.id, message.status);
        return true;
      default:
        return true;
    }
  }
}
