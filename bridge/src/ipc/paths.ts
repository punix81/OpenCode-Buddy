import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

// The bridge and the OpenCode plugin must resolve the same endpoint without
// sharing code (the plugin stays dependency-free and runs inside OpenCode).
// Keep path rules identical to plugin/opencode-buddy/index.js.
//
// Unix: XDG_RUNTIME_DIR is per-user and 0700 by contract. Without it, the
// directory name carries the uid so two users can never collide in a shared
// /tmp. Windows: %LOCALAPPDATA% is the per-user base; the pipe name is derived
// from the absolute runtime directory and never exposed through a fixed name.
// The plugin reads the runtime descriptor written by the bridge.

export type IpcPlatform = 'unix' | 'win32';

export interface IpcPaths {
  platform: IpcPlatform;
  dir: string;
  /** Unix socket path or Windows named-pipe path. */
  socket: string;
  tokenFile: string;
  /** Written by the Windows bridge, read by the plugin. */
  descriptorFile: string;
  lockFile: string;
}

export const IPC_DIR_NAME = 'opencode-buddy';

export function ipcPlatform(platform: NodeJS.Platform = process.platform): IpcPlatform {
  return platform === 'win32' ? 'win32' : 'unix';
}

function windowsBase(env: NodeJS.ProcessEnv): string {
  return env['LOCALAPPDATA'] || env['APPDATA'] || homedir();
}

export function ipcPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): IpcPaths {
  const kind = ipcPlatform(platform);
  const override = env['OPENCODE_BUDDY_RUNTIME_DIR'];

  if (kind === 'win32') {
    const dir = win32.resolve(override ?? win32.join(windowsBase(env), 'opencode-buddy-ipc'));
    // Stable per-user/per-directory pipe name; the runtime descriptor remains
    // the discovery mechanism. The 16-hex suffix is not a secret: the 256-bit
    // token is the authentication layer.
    const suffix = createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 16);
    return {
      platform: kind,
      dir,
      socket: `\\\\.\\pipe\\${IPC_DIR_NAME}-${suffix}`,
      tokenFile: win32.join(dir, 'token'),
      descriptorFile: win32.join(dir, 'bridge.json'),
      lockFile: win32.join(dir, 'bridge.lock'),
    };
  }

  const runtime = env['XDG_RUNTIME_DIR'];
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const base = override ?? runtime ?? tmpdir();
  const dir =
    override !== undefined
      ? override
      : runtime !== undefined
        ? join(base, IPC_DIR_NAME)
        : join(base, `${IPC_DIR_NAME}-${uid}`);

  return {
    platform: kind,
    dir,
    socket: join(dir, 'bridge.sock'),
    tokenFile: join(dir, 'token'),
    descriptorFile: join(dir, 'bridge.json'),
    lockFile: join(dir, 'bridge.lock'),
  };
}
