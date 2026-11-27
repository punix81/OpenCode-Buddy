import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

export function pipeHostPath(): string {
  const packaged = fileURLToPath(new URL('./pipe-host.exe', import.meta.url));
  const development = fileURLToPath(new URL('../../dist/ipc/pipe-host.exe', import.meta.url));
  if (existsSync(packaged)) return packaged;
  if (existsSync(development)) return development;
  throw new Error('Windows pipe host missing. Build it with installer/windows/build-pipe-host.ps1.');
}

export class WindowsPipeListener {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly connections = new Map<number, PassThrough>();

  constructor(private readonly onFailure: (error: Error) => void) {}

  start(address: string, accept: (peer: PassThrough) => void): Promise<void> {
    const child = spawn(pipeHostPath(), ['listen', address], { windowsHide: true });
    this.child = child;
    // Diagnostics may include machine-specific details. Drain them without
    // copying them into the plugin or device logs.
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    return new Promise((resolve, reject) => {
      let ready = false;
      const report = (error: Error): void => {
        if (!ready) reject(error);
        else if (this.child === child) this.onFailure(error);
      };
      const timer = setTimeout(() => {
        report(new Error('Windows pipe host startup timed out'));
        child.kill();
      }, 5000);
      child.once('error', report);
      child.stdin.on('error', () => {
        // 'close' reports the process failure and tears down all peers.
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        for (const connection of this.connections.values()) connection.destroy();
        this.connections.clear();
        report(new Error('Windows pipe host exited (code ' + String(code) + ')'));
      });
      lines.on('line', (line) => {
        if (line === 'ready' && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        const [type, rawId, data] = line.split(' ', 3);
        const id = Number(rawId);
        if (!ready || !Number.isSafeInteger(id) || id <= 0) return;
        if (type === 'open') {
          const peer = new PassThrough();
          this.connections.set(id, peer);
          peer.once('close', () => {
            if (this.connections.delete(id) && this.child === child) child.stdin.write(String(id) + '\n');
          });
          accept(peer);
        } else if (type === 'close') {
          const peer = this.connections.get(id);
          this.connections.delete(id);
          peer?.destroy();
        } else if (type === 'data' && data !== undefined) {
          const peer = this.connections.get(id);
          if (peer && !peer.destroyed) peer.write(Buffer.from(data, 'base64'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child === null || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('close', resolve);
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 1000);
      child.once('close', () => clearTimeout(timer));
    });
  }
}
