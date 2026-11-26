import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

import { DeviceDiscovery } from '../device/discovery.js';
import { loadConfig } from '../config.js';
import { ipcPaths } from '../ipc/paths.js';
import { IPC_VERSION } from '../ipc/messages.js';
import { applicableConfigFiles, findBuddyPlugin, readConfigPlugins } from './opencode-config.js';

const results: { level: 'OK' | 'WARN' | 'FAIL'; text: string }[] = [];
const ok = (text: string): void => void results.push({ level: 'OK', text });
const warn = (text: string): void => void results.push({ level: 'WARN', text });
const fail = (text: string): void => void results.push({ level: 'FAIL', text });

function checkOpenCode(): void {
  try {
    const version = execFileSync('opencode', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = /(\d+\.\d+\.\d+)/.exec(version);
    if (match !== null) ok(`opencode ${match[1]}`);
    else warn(`opencode reported an unexpected version: ${version}`);
  } catch (error) {
    fail(`opencode not runnable: ${(error as Error).message}`);
  }
}

function checkConfig(): void {
  const globalFile =
    process.env['OPENCODE_CONFIG'] ?? join(homedir(), '.config', 'opencode', 'opencode.json');
  const files = applicableConfigFiles(globalFile, process.cwd());
  if (files.length === 0) {
    fail(
      `no OpenCode configuration found (global ${globalFile}, no project file up to the repository root)`,
    );
    return;
  }

  let buddy: { entry: string; file: string } | undefined;
  let readable = 0;
  for (const file of files) {
    const result = readConfigPlugins(file);
    const info = result.plugins;
    if (info === undefined) {
      fail(`config ${file}: ${result.error ?? 'unreadable'}`);
      continue;
    }
    ++readable;
    ok(`config ${info.file}`);
    const found = findBuddyPlugin(info.plugins);
    if (found !== undefined && buddy === undefined) buddy = { entry: found, file: info.file };
  }
  if (readable === 0) return;

  if (buddy !== undefined) {
    const scope = buddy.file === globalFile ? 'global' : 'project';
    ok(`plugin configured (${scope}): ${buddy.entry}`);
  } else {
    warn(`opencode-buddy is not configured in ${files.join(', ')}`);
  }
}

async function checkIpc(): Promise<void> {
  const paths = ipcPaths();
  try {
    const mode = statSync(paths.dir).mode & 0o777;
    if (mode === 0o700) ok(`ipc directory ${paths.dir} mode 0700`);
    else warn(`ipc directory ${paths.dir} mode ${mode.toString(8)} (expected 700)`);
    statSync(paths.socket);
  } catch {
    fail(`no IPC socket at ${paths.socket} — is the bridge running in live mode?`);
    return;
  }

  let token: string;
  try {
    token = readFileSync(paths.tokenFile, 'utf8').trim();
  } catch {
    fail(`token file unreadable: ${paths.tokenFile}`);
    return;
  }

  const outcome = await new Promise<string>((resolve) => {
    const socket = createConnection(paths.socket);
    let settled = false;
    const done = (value: string): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(
        `${JSON.stringify({
          v: IPC_VERSION,
          type: 'hello',
          token,
          pid: process.pid,
          app: 'diagnose',
          appVersion: '1',
          plugin: 'opencode-buddy-diagnose',
          pluginVersion: '1',
        })}\n`,
      );
      socket.write(`${JSON.stringify({ v: IPC_VERSION, type: 'heartbeat', at: Date.now() })}\n`);
      setTimeout(() => done('accepted'), 400);
    });
    socket.on('error', (error: Error) => done(`error: ${error.message}`));
    socket.on('close', () => done('rejected: socket closed by the bridge'));
  });

  if (outcome === 'accepted') ok('IPC handshake accepted (token valid)');
  else fail(`IPC handshake ${outcome}`);
}

async function checkSerial(): Promise<void> {
  const discovery = new DeviceDiscovery();
  try {
    const candidate = await discovery.select(loadConfig());
    ok(`device ${candidate.path}`);
  } catch (error) {
    warn(`no device: ${(error as Error).message}`);
  }
}

checkOpenCode();
checkConfig();

await checkIpc();
await checkSerial();

for (const line of results) {
  console.log(`${line.level.padEnd(4)} ${line.text}`);
}
process.exitCode = results.some((line) => line.level === 'FAIL') ? 1 : 0;
