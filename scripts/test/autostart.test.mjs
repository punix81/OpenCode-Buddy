// Startup definitions are generated into isolated files. No systemd unit is
// enabled and no Windows Startup entry is created by these tests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = resolve(REPO, 'scripts', 'autostart.mjs');

test('the Linux unit is a user service with a restart policy', () => {
  const output = execFileSync(
    process.execPath,
    [CLI, '--platform', 'linux', '--app-dir', '/opt/opencode-buddy'],
    { encoding: 'utf8' },
  );
  assert.match(output, /\[Service\]/);
  assert.match(output, /ExecStart=\/opt\/opencode-buddy\/bin\/opencode-buddy-run/);
  assert.match(output, /Restart=on-failure/);
  assert.match(output, /WantedBy=default\.target/);
  assert.match(output, /Dry-run/);
});

test('the Windows startup is hidden and user-scoped', () => {
  const output = execFileSync(
    process.execPath,
    [CLI, '--platform', 'win32', '--app-dir', 'C:\\Buddy'],
    { encoding: 'utf8' },
  );
  assert.match(output, /WScript\.Shell/);
  assert.match(output, /opencode-buddy-run\.cmd/);
  assert.doesNotMatch(output, /schtasks|sc\.exe/i);
});

test('--apply writes only the explicit output path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-autostart-'));
  const file = join(dir, 'buddy.service');
  try {
    execFileSync(
      process.execPath,
      [CLI, '--platform', 'linux', '--app-dir', '/opt/buddy', '--output', file, '--apply'],
      { encoding: 'utf8' },
    );
    assert.match(readFileSync(file, 'utf8'), /ExecStart=\/opt\/buddy\/bin\/opencode-buddy-run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--apply without an explicit output is refused', () => {
  assert.throws(() =>
    execFileSync(process.execPath, [CLI, '--apply'], { stdio: 'ignore' }),
  );
});
