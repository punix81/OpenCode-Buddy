import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { Server } from 'node:net';

import { WindowsPipeListener, pipeHostPath } from './windows-pipe.js';
import type { IpcPaths } from './paths.js';

// Platform-specific transport around one `net.Server`. The IPC message layer,
// authentication, rate limits, peering and lock are shared; only endpoint
// preparation and listening differ. This keeps the Unix implementation intact
// and avoids a second bridge application for Windows.

export interface IpcEndpoint {
  readonly address: string;
  /** Creates or validates the per-user directory. No shared files yet. */
  ensureDirectory(): void;
  /** Writes the token (and, on Windows, the runtime descriptor). */
  prepare(token: string): void;
  listen(server: Server): Promise<void>;
  close(server: Server): Promise<void>;
  /** Removes only the endpoint/token/descriptor, never an unrelated file. */
  cleanup(): void;
}

function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function assertRealDirectory(dir: string): void {
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`ipc directory is not a real directory: ${dir}`);
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error(`ipc directory is owned by another user: ${dir}`);
  }
}

class UnixSocketEndpoint implements IpcEndpoint {
  readonly address: string;
  private prepared = false;

  constructor(private readonly paths: IpcPaths) {
    this.address = paths.socket;
  }

  ensureDirectory(): void {
    mkdirSync(this.paths.dir, { recursive: true, mode: 0o700 });
    assertRealDirectory(this.paths.dir);
    chmodSync(this.paths.dir, 0o700);
  }

  prepare(token: string): void {
    const { socket, tokenFile } = this.paths;
    // A socket left by a crashed bridge would block listen(). Refuse to touch
    // anything that is not a socket: a symlink or a regular file must never be
    // unlinked on our behalf.
    try {
      const existing = lstatSync(socket);
      if (!existing.isSocket()) {
        throw new Error(`refusing to replace a non-socket path: ${socket}`);
      }
      unlinkSync(socket);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
    unlinkIfPresent(tokenFile);
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600, flag: 'wx' });
    chmodSync(tokenFile, 0o600);
    this.prepared = true;
  }

  listen(server: Server): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(this.address, () => {
        server.off('error', onError);
        chmodSync(this.address, 0o600);
        resolve();
      });
    });
  }

  close(server: Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  cleanup(): void {
    if (!this.prepared) return;
    this.prepared = false;
    try {
      rmSync(this.paths.socket, { force: true });
      rmSync(this.paths.tokenFile, { force: true });
    } catch {
      // Best effort: the directory is ours and 0700.
    }
  }
}

class NamedPipeEndpoint implements IpcEndpoint {
  readonly address: string;
  private readonly listener: WindowsPipeListener;
  private prepared = false;

  constructor(private readonly paths: IpcPaths, onFailure: (error: Error) => void) {
    this.address = paths.socket;
    this.listener = new WindowsPipeListener(onFailure);
  }

  ensureDirectory(): void {
    execFileSync(pipeHostPath(), ['directory', this.paths.dir], {
      windowsHide: true, timeout: 5000, stdio: 'pipe',
    });
  }

  prepare(token: string): void {
    const { tokenFile, descriptorFile, socket } = this.paths;
    unlinkIfPresent(tokenFile);
    unlinkIfPresent(descriptorFile);
    writeFileSync(tokenFile, token + '\n', { flag: 'wx' });
    this.prepared = true;
    const descriptor = JSON.stringify({ v: 1, platform: 'win32', address: socket, token, pid: process.pid });
    writeFileSync(descriptorFile, descriptor + '\n', { flag: 'wx' });
  }

  listen(server: Server): Promise<void> {
    return this.listener.start(this.address, (connection) => server.emit('buddy-connection', connection));
  }

  close(): Promise<void> {
    return this.listener.stop();
  }

  cleanup(): void {
    if (!this.prepared) return;
    this.prepared = false;
    unlinkIfPresent(this.paths.descriptorFile);
    unlinkIfPresent(this.paths.tokenFile);
  }
}

export function createIpcEndpoint(paths: IpcPaths, onFailure: (error: Error) => void): IpcEndpoint {
  return paths.platform === 'win32'
    ? new NamedPipeEndpoint(paths, onFailure)
    : new UnixSocketEndpoint(paths);
}
