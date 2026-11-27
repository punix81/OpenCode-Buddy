#!/usr/bin/env node
// Safe, non-destructive installer for the OpenCode Buddy plugin.
//
// The default action only prints what would change. Writing requires --apply.
// The file may be JSONC with comments; only the plugin array is edited and a
// timestamped backup is written first. The real global OpenCode configuration is
// never modified during development.
//
// Usage:
//   node scripts/install-buddy-plugin.mjs --project DIR [--apply|--check]
//   node scripts/install-buddy-plugin.mjs --project DIR --apply --uninstall
//   node scripts/install-buddy-plugin.mjs --global [--apply] [--check]
//   node scripts/install-buddy-plugin.mjs --project DIR --apply --plugin DIR
//
// Exit codes: 0 success/installed, 1 check not installed, 2 usage/error.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ConfigEditError,
  addPlugin,
  backupSuffix,
  configFileForGlobal,
  normalizePluginPath,
  pluginInstalled,
  removePlugin,
} from './lib/opencode-plugin-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDirDefault = resolve(here, '..', 'plugin', 'opencode-buddy');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const apply = has('--apply');
const check = has('--check');
const uninstall = has('--uninstall');
const globalMode = has('--global');
const projectDir = valueOf('--project');
const pluginDir = valueOf('--plugin') !== undefined ? resolve(valueOf('--plugin')) : pluginDirDefault;

if (apply && check) {
  console.error('choose either --apply or --check');
  process.exit(2);
}
if (globalMode && projectDir !== undefined) {
  console.error('choose either --global or --project');
  process.exit(2);
}
if (!globalMode && projectDir === undefined) {
  console.error('specify --project DIR or --global (dry-run unless --apply is given)');
  process.exit(2);
}
if (!existsSync(join(pluginDir, 'index.js'))) {
  console.error(`plugin not found at ${pluginDir}`);
  process.exit(2);
}

function projectConfigFile(directory) {
  const json = join(resolve(directory), 'opencode.json');
  if (existsSync(json)) return json;
  const jsonc = join(resolve(directory), 'opencode.jsonc');
  if (existsSync(jsonc)) return jsonc;
  return json;
}

const target = globalMode ? configFileForGlobal(process.env, process.platform, process.env.HOME) : projectConfigFile(projectDir);
const exists = existsSync(target);
const source = exists ? readFileSync(target, 'utf8') : '';

function printResult(changed, next) {
  if (check) {
    console.log(changed ? `OK   plugin configured in ${target}` : `WARN plugin not configured in ${target}`);
    return;
  }
  if (!changed) {
    console.log(`OK   plugin already ${uninstall ? 'absent from' : 'configured in'} ${target}`);
    return;
  }
  if (!apply) {
    console.log(`DRY-RUN target=${target}`);
    console.log(`plugin=${normalizePluginPath(pluginDir)}`);
    console.log('');
    console.log(next);
    console.log('');
    console.log('Nothing modified. Re-run with --apply to write (a backup is created first).');
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  if (exists) {
    const backup = `${target}.bak-${backupSuffix()}`;
    copyFileSync(target, backup);
    console.log(`backup: ${backup}`);
  }
  writeFileSync(target, next);
  console.log(`written: ${target}`);
}

try {
  if (check) {
    const installed = exists && pluginInstalled(source, pluginDir);
    printResult(installed, source);
    process.exit(installed ? 0 : 1);
  }
  const result = uninstall ? removePlugin(source, pluginDir) : addPlugin(source, pluginDir);
  printResult(result.changed, result.text);
} catch (error) {
  if (error instanceof ConfigEditError) {
    console.error(`configuration error: ${error.message}`);
    process.exit(2);
  }
  console.error(`installation failed: ${error.message}`);
  process.exit(2);
}
