#!/usr/bin/env node
// Non-destructive installer for the OpenCode Buddy plugin.
//
// The default action only prints what to change. Nothing is written to the
// global OpenCode configuration: that file belongs to the product owner and may
// contain comments, providers, agents and MCP servers.
//
// Usage:
//   node scripts/install-buddy-plugin.mjs            # show the exact snippet
//   node scripts/install-buddy-plugin.mjs --check    # exit 1 when not installed
//   node scripts/install-buddy-plugin.mjs --project DIR
//                                                    # write DIR/opencode.json only

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..', 'plugin', 'opencode-buddy');
const globalConfig = process.env['OPENCODE_CONFIG'] ?? join(homedir(), '.config', 'opencode', 'opencode.json');

const args = process.argv.slice(2);
const check = args.includes('--check');
const projectIndex = args.indexOf('--project');
const projectDir = projectIndex >= 0 ? resolve(args[projectIndex + 1] ?? '.') : null;

function readConfig(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function installedIn(json) {
  const list = json?.['plugins'] ?? json?.['plugin'] ?? [];
  return Array.isArray(list) && list.some((entry) => {
    const name = typeof entry === 'string' ? entry : entry?.package;
    return typeof name === 'string' && resolve(name) === pluginDir;
  });
}

if (!existsSync(join(pluginDir, 'index.js'))) {
  console.error(`plugin not found at ${pluginDir}`);
  process.exit(2);
}

if (check) {
  const current = readConfig(globalConfig);
  if (current?.json && installedIn(current.json)) {
    console.log(`OK   plugin configured in ${globalConfig}`);
    process.exit(0);
  }
  console.log(`WARN plugin not configured in ${globalConfig}`);
  process.exit(1);
}

const snippet = `"plugins": [ "${pluginDir}" ]`;
console.log(`Plugin directory: ${pluginDir}`);
console.log('');
console.log('Add this entry to the "plugins" array of your OpenCode configuration');
console.log(`(${globalConfig}), keeping every other entry:`);
console.log('');
console.log(`  ${snippet}`);
console.log('');
console.log('Or merge it by hand:');
console.log(`  1. copy ${globalConfig} to ${globalConfig}.bak-$(date +%Y%m%d-%H%M%S)`);
console.log('  2. add the entry above');
console.log('  3. restart the OpenCode service: opencode service restart');
console.log('');
console.log('Nothing has been modified by this script.');

if (projectDir !== null) {
  const target = join(projectDir, 'opencode.json');
  const current = readConfig(target);
  if (current !== null && current.json === null) {
    console.error(`refusing to rewrite ${target}: it contains comments or is not strict JSON`);
    process.exit(3);
  }
  const json = current?.json ?? { $schema: 'https://opencode.ai/config.json' };
  const list = Array.isArray(json.plugins) ? json.plugins : [];
  if (!list.some((entry) => (typeof entry === 'string' ? resolve(entry) : entry?.package) === pluginDir)) {
    json.plugins = [...list, pluginDir];
  }
  mkdirSync(projectDir, { recursive: true });
  if (current !== null) {
    const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(target, backup);
    console.log(`backup: ${backup}`);
  }
  writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`written: ${target}`);
}
