// Isolated configuration fixtures only. No global OpenCode configuration, no
// provider, MCP server or real user file is touched.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ConfigEditError,
  addPlugin,
  parseJsonc,
  pluginInstalled,
  removePlugin,
} from '../lib/opencode-plugin-config.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = resolve(REPO, 'scripts', 'install-buddy-plugin.mjs');
const PLUGIN = resolve(REPO, 'plugin', 'opencode-buddy');
const OTHER = resolve(REPO, 'plugin', 'other-plugin');

function temp(prefix = 'buddy-install-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('installing into JSONC preserves comments, providers, MCP and other plugins', () => {
  const source = `{
  // user settings stay
  "providers": { "local": { "model": "x" } },
  "mcp": { "files": { "command": "mcp-files" } },
  "plugins": [
    ${JSON.stringify(OTHER)} // another plugin
  ],
  "skills": ["review"]
}\n`;
  const result = addPlugin(source, PLUGIN);
  assert.equal(result.changed, true);
  assert.match(result.text, /\/\/ user settings stay/);
  assert.match(result.text, /"providers"/);
  assert.match(result.text, /"mcp"/);
  assert.match(result.text, /"skills"/);
  const parsed = parseJsonc(result.text);
  assert.deepEqual(parsed.plugins, [OTHER, PLUGIN]);
  assert.equal(pluginInstalled(result.text, PLUGIN), true);
  assert.equal(addPlugin(result.text, PLUGIN).changed, false, 'installation is idempotent');
});

test('a configuration without a plugin array gets one and keeps its settings', () => {
  const source = `{
  // no plugins yet
  "model": "local",
  "mcp": { "a": { "command": "a" } }
}\n`;
  const result = addPlugin(source, PLUGIN);
  const parsed = parseJsonc(result.text);
  assert.deepEqual(parsed.plugins, [PLUGIN]);
  assert.equal(parsed.model, 'local');
  assert.match(result.text, /\/\/ no plugins yet/);
});

test('an existing object entry with the package field is detected and not duplicated', () => {
  const source = `{ "plugins": [{ "package": ${JSON.stringify(PLUGIN)}, "enabled": true }] }\n`;
  assert.equal(pluginInstalled(source, PLUGIN), true);
  assert.equal(addPlugin(source, PLUGIN).changed, false);
});

test('uninstall removes only Buddy and preserves the other entries and comments', () => {
  const source = `{
  // keep this comment
  "plugins": [
    ${JSON.stringify(OTHER)},
    ${JSON.stringify(PLUGIN)} // buddy
  ],
  "mcp": { "keep": { "command": "keep" } }
}\n`;
  const result = removePlugin(source, PLUGIN);
  assert.equal(result.changed, true);
  const parsed = parseJsonc(result.text);
  assert.deepEqual(parsed.plugins, [OTHER]);
  assert.equal(parsed.mcp.keep.command, 'keep');
  assert.match(result.text, /keep this comment/);
  assert.equal(pluginInstalled(result.text, PLUGIN), false);
  assert.equal(removePlugin(result.text, PLUGIN).changed, false);
});

test('invalid JSONC is rejected instead of being overwritten', () => {
  assert.throws(() => addPlugin('{ "plugins": [', PLUGIN), ConfigEditError);
  assert.throws(() => parseJsonc('not json'), ConfigEditError);
});

test('the installer is dry-run by default and backs up before --apply', () => {
  const dir = temp();
  const config = join(dir, 'opencode.jsonc');
  const original = `{
  // fixture
  "mcp": { "keep": { "command": "keep" } }
}\n`;
  writeFileSync(config, original);
  try {
    const dry = execFileSync(process.execPath, [CLI, '--project', dir], {
      cwd: REPO,
      encoding: 'utf8',
    });
    assert.match(dry, /DRY-RUN/);
    assert.equal(readFileSync(config, 'utf8'), original, 'dry-run must not write');

    const applied = execFileSync(
      process.execPath,
      [CLI, '--project', dir, '--apply'],
      { cwd: REPO, encoding: 'utf8' },
    );
    assert.match(applied, /backup:/);
    const after = readFileSync(config, 'utf8');
    assert.notEqual(after, original);
    assert.equal(pluginInstalled(after, PLUGIN), true);
    assert.match(after, /\/\/ fixture/);
    const backups = readdirSync(dir).filter((name) => name.startsWith('opencode.jsonc.bak-'));
    assert.equal(backups.length, 1);

    execFileSync(process.execPath, [CLI, '--project', dir, '--check'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    const removed = execFileSync(
      process.execPath,
      [CLI, '--project', dir, '--apply', '--uninstall'],
      { cwd: REPO, encoding: 'utf8' },
    );
    assert.match(removed, /written:/);
    assert.equal(pluginInstalled(readFileSync(config, 'utf8'), PLUGIN), false);
    assert.equal(existsSync(config), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
