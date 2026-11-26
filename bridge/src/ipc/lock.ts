import { readFileSync } from 'node:fs';

import type { IpcPaths } from './paths.js';

// Shared single-instance helpers. The lock is the authoritative protection; the
// preflight check below keeps a second serial CLI from opening the USB port
// before it discovers that a live bridge already owns it.

export function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user: still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLockOwner(lockFile: string): number | null {
  try {
    const owner = Number.parseInt(readFileSync(lockFile, 'utf8').trim(), 10);
    return Number.isInteger(owner) && owner > 0 ? owner : null;
  } catch {
    return null;
  }
}

export function assertNoOtherBridge(paths: IpcPaths, ownPid = process.pid): void {
  const owner = readLockOwner(paths.lockFile);
  if (owner !== null && owner !== ownPid && pidIsAlive(owner)) {
    throw new Error(`another bridge is running (pid ${owner})`);
  }
}
