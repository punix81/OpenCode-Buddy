import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../..', import.meta.url));

test('the portable installer owns only its app, launchers, plugin entry and startup definition', () => {
  const root = mkdtempSync(join(tmpdir(), 'buddy-install-'));
  const archive = join(root, 'extracted');
  const prefix = join(root, 'installed app');
  const project = join(root, 'project');
  const startup = join(root, 'fixture-startup');
  const app = join(archive, 'app');
  const installer = join(archive, 'install.mjs');
  const config = join(project, 'opencode.json');
  const unrelated = join(prefix, 'retain.txt');
  const install = (...args) => execFileSync(process.execPath, [
    installer, '--prefix', prefix, '--plugin-project', project, ...args,
  ], { stdio: 'pipe' });
  try {
    for (const path of [join(app, 'plugin', 'opencode-buddy'), join(app, 'bridge'), join(app, 'scripts'), prefix, project]) {
      mkdirSync(path, { recursive: true });
    }
    for (const script of ['install-buddy-plugin.mjs', 'autostart.mjs', 'lib']) {
      cpSync(join(repo, 'scripts', script), join(app, 'scripts', script), { recursive: true });
    }
    cpSync(join(repo, 'scripts', 'install-buddy.mjs'), installer);
    writeFileSync(join(app, 'plugin', 'opencode-buddy', 'index.js'), '');
    writeFileSync(join(app, 'bridge', 'package.json'), '{"version":"0.2.0"}');
    writeFileSync(unrelated, 'keep');
    writeFileSync(config, '{"plugins":["other-plugin"],"mcp":{"fixture":{}}}');
    install('--autostart-output', startup);
    assert.equal(existsSync(startup), false);
    assert.equal(existsSync(join(prefix, 'install.json')), false);

    install('--autostart-output', startup, '--apply');
    const applied = JSON.parse(readFileSync(config, 'utf8'));
    const installedApp = join(prefix, 'app');
    assert.deepEqual(applied.plugins, ['other-plugin', join(installedApp, 'plugin', 'opencode-buddy')]);
    assert.equal(existsSync(startup), true);
    const obsolete = join(installedApp, 'obsolete.txt');
    writeFileSync(obsolete, 'old app file');
    install('--apply');
    assert.equal(existsSync(obsolete), false);
    assert.deepEqual(JSON.parse(readFileSync(config, 'utf8')), applied);

    install('--uninstall', '--apply');
    assert.equal(existsSync(installedApp), false);
    assert.equal(existsSync(startup), false);
    assert.equal(readFileSync(unrelated, 'utf8'), 'keep');
    assert.deepEqual(JSON.parse(readFileSync(config, 'utf8')), { plugins: ['other-plugin'], mcp: { fixture: {} } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
