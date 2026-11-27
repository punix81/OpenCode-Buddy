#!/usr/bin/env node
// Generates an optional user-scoped startup definition. It never enables,
// registers or starts a real service. Writing requires --apply and an explicit
// --output path; a later native installation step decides where to place it.
//
// Usage:
//   node scripts/autostart.mjs --platform linux --app-dir DIR
//   node scripts/autostart.mjs --platform linux --app-dir DIR --output FILE --apply
//   node scripts/autostart.mjs --platform win32 --app-dir DIR --output FILE --apply

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const platform = valueOf('--platform') ?? process.platform;
const apply = args.includes('--apply');
const appDir = resolve(valueOf('--app-dir') ?? '.');
const output = valueOf('--output');

if (platform !== 'linux' && platform !== 'win32') {
  console.error('--platform must be linux or win32');
  process.exit(2);
}
if (apply && output === undefined) {
  console.error('--apply requires --output FILE; no real service is registered');
  process.exit(2);
}

export function linuxUnit(directory) {
  const launcher = resolve(directory, 'bin', 'opencode-buddy-run');
  return `[Unit]
Description=OpenCode Buddy bridge (user)
After=default.target

[Service]
Type=simple
ExecStart=${launcher}
Restart=on-failure
RestartSec=5
# The bridge exits cleanly when OpenCode is absent; it must never block it.
KillMode=process

[Install]
WantedBy=default.target
`;
}

export function windowsStartupScript(directory) {
  const launcher = resolve(directory, 'bin', 'opencode-buddy-run.cmd');
  // Hidden window, current user, no elevation. The caller decides whether to
  // place this file in the user's Startup folder.
  return `' OpenCode Buddy user startup (generated; no elevation)
Set shell = CreateObject("WScript.Shell")
shell.Run """" & "${launcher.replace(/"/g, '""')}" & """", 0, False
`;
}

const content = platform === 'linux' ? linuxUnit(appDir) : windowsStartupScript(appDir);
if (!apply) {
  console.log(`# platform=${platform} app_dir=${appDir}`);
  console.log(content);
  console.log('# Dry-run: no startup file written and no service registered.');
  process.exit(0);
}
const target = resolve(output);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content);
console.log(`written: ${target}`);
console.log('Not enabled or started. Install/enable it only during the native acceptance step.');
