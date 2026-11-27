#!/usr/bin/env node
// Portable installer for the OpenCode Buddy app tree produced by
// scripts/package-portable.mjs. It never flashes firmware, never creates a real
// startup service and never modifies OpenCode unless --apply and an explicit
// plugin target are given.
//
// Usage (inside the extracted archive):
//   node install.mjs --prefix DIR --apply
//   node install.mjs --prefix DIR --plugin-project PROJECT --apply
//   node install.mjs --prefix DIR --plugin-global --apply
//   node install.mjs --prefix DIR --autostart-output FILE --apply
//   node install.mjs --prefix DIR --uninstall --plugin-project PROJECT --apply
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir, platform as nodePlatform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, 'app');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const apply = has('--apply');
const uninstall = has('--uninstall');
const platform = valueOf('--platform') ?? nodePlatform();
const expand = (value) => (value.startsWith('~') ? join(homedir(), value.slice(1)) : value);
const prefix = resolve(expand(valueOf('--prefix') ?? (platform === 'win32'
  ? join(process.env.LOCALAPPDATA ?? homedir(), 'opencode-buddy')
  : join(homedir(), '.local', 'share', 'opencode-buddy'))));
const pluginProject = valueOf('--plugin-project');
const pluginGlobal = has('--plugin-global');
const autostartOutput = valueOf('--autostart-output');

if (!existsSync(appDir)) {
  console.error(`application tree not found at ${appDir}`);
  process.exit(2);
}
if (pluginProject !== undefined && pluginGlobal) {
  console.error('choose either --plugin-project or --plugin-global');
  process.exit(2);
}

function run(command, commandArgs, cwd = here) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function nodeBin() {
  return process.execPath;
}

function pluginArgs(mode) {
  const result = [];
  if (pluginProject !== undefined) result.push('--project', resolve(pluginProject));
  if (pluginGlobal) result.push('--global');
  if (mode === 'uninstall') result.push('--uninstall');
  if (apply) result.push('--apply');
  return result;
}

function writeLauncher() {
  const bin = join(prefix, 'bin');
  mkdirSync(bin, { recursive: true });
  if (platform === 'win32') {
    const direct = join(bin, 'opencode-buddy.cmd');
    writeFileSync(direct, `@echo off\r\nnode "%~dp0..\\app\\bin\\opencode-buddy.mjs" %*\r\n`);
    const supervised = join(bin, 'opencode-buddy-run.cmd');
    writeFileSync(supervised, `@echo off\r\nnode "%~dp0..\\app\\bin\\opencode-buddy-run.mjs" %*\r\n`);
    return direct;
  }
  const direct = join(bin, 'opencode-buddy');
  writeFileSync(direct, `#!/bin/sh\nexec node "${join(prefix, 'app', 'bin', 'opencode-buddy.mjs')}" "$@"\n`);
  chmodSync(direct, 0o755);
  const supervised = join(bin, 'opencode-buddy-run');
  writeFileSync(supervised, `#!/bin/sh\nexec node "${join(prefix, 'app', 'bin', 'opencode-buddy-run.mjs')}" "$@"\n`);
  chmodSync(supervised, 0o755);
  return direct;
}

if (uninstall) {
  if (pluginProject !== undefined || pluginGlobal) {
    run(nodeBin(), [join(appDir, 'scripts', 'install-buddy-plugin.mjs'), ...pluginArgs('uninstall')]);
  }
  if (!apply) {
    console.log(`DRY-RUN would remove ${prefix} (only OpenCode Buddy's own app/launcher)`);
    process.exit(0);
  }
  rmSync(prefix, { recursive: true, force: true });
  console.log(`removed ${prefix}`);
  console.log('OpenCode itself, unrelated plugins, MCP servers and user configuration are untouched.');
  process.exit(0);
}

if (!apply) {
  console.log(`DRY-RUN prefix=${prefix} platform=${platform}`);
  console.log(`would copy ${appDir} -> ${prefix}/app`);
  console.log(`would create ${join(prefix, 'bin', platform === 'win32' ? 'opencode-buddy.cmd' : 'opencode-buddy')}`);
  if (pluginProject !== undefined || pluginGlobal) {
    run(nodeBin(), [join(appDir, 'scripts', 'install-buddy-plugin.mjs'), ...pluginArgs('install')]);
  }
  if (autostartOutput !== undefined) {
    run(nodeBin(), [join(appDir, 'scripts', 'autostart.mjs'), '--platform', platform, '--app-dir', prefix, '--output', resolve(autostartOutput)]);
  }
  console.log('Nothing modified. Re-run with --apply.');
  process.exit(0);
}

cpSync(appDir, join(prefix, 'app'), { recursive: true });
const launcher = writeLauncher();
writeFileSync(
  join(prefix, 'install.json'),
  `${JSON.stringify({ schema: 1, version: JSON.parse(readFileSync(join(appDir, 'bridge', 'package.json'), 'utf8')).version, platform, app: join(prefix, 'app'), installedAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`installed ${prefix}`);
console.log(`launcher ${launcher}`);
if (pluginProject !== undefined || pluginGlobal) {
  run(nodeBin(), [join(appDir, 'scripts', 'install-buddy-plugin.mjs'), ...pluginArgs('install')]);
}
if (autostartOutput !== undefined) {
  run(nodeBin(), [join(appDir, 'scripts', 'autostart.mjs'), '--platform', platform, '--app-dir', prefix, '--output', resolve(autostartOutput), '--apply']);
}
console.log('No firmware was flashed. Start the bridge with the launcher when a compatible device is present.');
