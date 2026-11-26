import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The bridge and the OpenCode plugin must resolve the same paths without sharing
// code (the plugin stays dependency-free and runs inside OpenCode). Keep this
// rule identical to plugin/opencode-buddy/index.js.
//
// XDG_RUNTIME_DIR is per-user and 0700 by contract. Without it, the directory
// name carries the uid so two users can never collide in a shared /tmp.
export interface IpcPaths {
  dir: string;
  socket: string;
  tokenFile: string;
  lockFile: string;
}

export const IPC_DIR_NAME = 'opencode-buddy';

export function ipcPaths(env: NodeJS.ProcessEnv = process.env): IpcPaths {
  const override = env['OPENCODE_BUDDY_RUNTIME_DIR'];
  const runtime = env['XDG_RUNTIME_DIR'];
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;

  const base = override ?? runtime ?? tmpdir();
  const dir = override !== undefined
    ? override
    : runtime !== undefined
      ? join(base, IPC_DIR_NAME)
      : join(base, `${IPC_DIR_NAME}-${uid}`);

  return {
    dir,
    socket: join(dir, 'bridge.sock'),
    tokenFile: join(dir, 'token'),
    lockFile: join(dir, 'bridge.lock'),
  };
}
