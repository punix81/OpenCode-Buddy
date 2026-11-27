// Manifest verification is pure file I/O. No port is opened, no esptool runs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = resolve(REPO, 'scripts', 'firmware-verify.mjs');

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-firmware-'));
  const bytes = Buffer.from('firmware-fixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const image = join(dir, 'image.bin');
  const manifest = join(dir, 'manifest.json');
  writeFileSync(image, bytes);
  writeFileSync(
    manifest,
    JSON.stringify({
      schema: 1,
      label: 'fixture',
      version: '0.0.0',
      sha256,
      size: bytes.length,
      flashOffset: '0x10000',
      appOnly: true,
      rollback: { sha256: 'a'.repeat(64), size: 1 },
    }),
  );
  return { dir, image, manifest, bytes };
}

test('a matching application image passes and a plan prints without execution', () => {
  const { dir, image, manifest } = fixture();
  try {
    const output = execFileSync(
      process.execPath,
      [CLI, '--manifest', manifest, '--image', image, '--plan'],
      { encoding: 'utf8' },
    );
    assert.match(output, /OK   fixture/);
    assert.match(output, /FLASH PLAN/);
    assert.match(output, /write-flash 0x10000/);
    assert.doesNotMatch(output, /Successfully wrote|Hard resetting/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a modified image is rejected', () => {
  const { dir, image, manifest } = fixture();
  try {
    writeFileSync(image, Buffer.concat([Buffer.from('x'), Buffer.from('firmware-fixture')]));
    assert.throws(() =>
      execFileSync(process.execPath, [CLI, '--manifest', manifest, '--image', image], {
        stdio: 'ignore',
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-application manifest is rejected for an app-only workflow', () => {
  const { dir, image, manifest, bytes } = fixture();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    writeFileSync(
      manifest,
      JSON.stringify({ schema: 1, sha256, size: bytes.length, flashOffset: '0x10000', appOnly: false }),
    );
    assert.throws(() =>
      execFileSync(process.execPath, [CLI, '--manifest', manifest, '--image', image], {
        stdio: 'ignore',
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
