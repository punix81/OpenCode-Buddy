import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applicableConfigFiles,
  findBuddyPlugin,
  projectConfigFiles,
  readConfigPlugins,
  stripJsonc,
} from '../src/cli/opencode-config.js';

function withTempDir(run: (dir: string) => void): () => void {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'buddy-config-'));
    try {
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'project config files are nearest first and stop at the repository root',
  withTempDir((dir) => {
    const root = join(dir, 'repo');
    mkdirSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, 'pkg', 'deep'), { recursive: true });
    writeFileSync(join(root, 'opencode.json'), '{}');
    writeFileSync(join(root, 'pkg', 'opencode.jsonc'), '{}');
    writeFileSync(join(dir, 'opencode.json'), '{}');

    assert.deepEqual(projectConfigFiles(join(root, 'pkg', 'deep')), [
      join(root, 'pkg', 'opencode.jsonc'),
      join(root, 'opencode.json'),
    ]);
  }),
);

test(
  'JSONC comments and trailing commas are accepted',
  withTempDir((dir) => {
    const file = join(dir, 'opencode.jsonc');
    writeFileSync(
      file,
      `{
        // the buddy entry
        "plugins": [
          "/opt/opencode-buddy", /* trailing comma below */
        ],
      }\n`,
    );
    const result = readConfigPlugins(file);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.plugins?.plugins, ['/opt/opencode-buddy']);
  }),
);

test(
  'the legacy plugin key and object entries are read',
  withTempDir((dir) => {
    const file = join(dir, 'opencode.json');
    writeFileSync(
      file,
      JSON.stringify({ plugin: [{ package: 'opencode-buddy', options: {} }, '@bit-ai/opencode'] }),
    );
    const result = readConfigPlugins(file);
    assert.deepEqual(result.plugins?.plugins, ['opencode-buddy', '@bit-ai/opencode']);
  }),
);

test(
  'invalid JSON and a non-array plugins value are reported, not swallowed',
  withTempDir((dir) => {
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ "plugins": [ }');
    assert.notEqual(readConfigPlugins(broken).error, undefined);

    const wrong = join(dir, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ plugins: 'opencode-buddy' }));
    assert.notEqual(readConfigPlugins(wrong).error, undefined);

    const nulled = join(dir, 'null.json');
    writeFileSync(nulled, JSON.stringify({ plugins: null }));
    assert.notEqual(readConfigPlugins(nulled).error, undefined);
  }),
);

test(
  'applicable config files skip missing files and duplicates',
  withTempDir((dir) => {
    const root = join(dir, 'repo');
    mkdirSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'opencode.json'), '{}');
    writeFileSync(join(root, 'opencode.jsonc'), '{}');
    const global = join(dir, 'global.json');

    assert.deepEqual(applicableConfigFiles(global, join(root, 'sub')), [
      join(root, 'opencode.json'),
      join(root, 'opencode.jsonc'),
    ]);
    assert.deepEqual(applicableConfigFiles(join(root, 'opencode.json'), join(root, 'sub')), [
      join(root, 'opencode.json'),
      join(root, 'opencode.jsonc'),
    ]);
  }),
);

test('stripJsonc leaves string contents untouched', () => {
  const text = '{"url": "https://example.test/a//b", "x": 1,}';
  assert.equal(stripJsonc(text), '{"url": "https://example.test/a//b", "x": 1}');
});

test('findBuddyPlugin matches both package and path entries', () => {
  assert.equal(findBuddyPlugin(['@bit-ai/opencode', '/repo/plugin/opencode-buddy']), '/repo/plugin/opencode-buddy');
  assert.equal(findBuddyPlugin(['@bit-ai/opencode']), undefined);
});
