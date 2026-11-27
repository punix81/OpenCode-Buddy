#!/usr/bin/env node
// Builds a portable OpenCode Buddy application tree. The end user does not need
// TypeScript, a compiler or npm: the tree contains the compiled bridge, the
// runtime dependencies (SerialPort prebuilds) and the plugin.
//
// This script is executed on the build platform. A Windows package must be
// built and tested on Windows; a Linux build is not a native Windows validation.
//
// Usage:
//   node scripts/package-portable.mjs --out release [--platform linux|win32] [--no-archive]

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repo = resolve(here, '..');
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const outRoot = resolve(valueOf('--out') ?? join(repo, 'release'));
const platform = valueOf('--platform') ?? process.platform;
if (!['linux', 'win32'].includes(platform) || platform !== process.platform) {
  throw new Error('Build the portable package on its target operating system.');
}
const archive = !args.includes('--no-archive');
const version = JSON.parse(readFileSync(join(repo, 'bridge', 'package.json'), 'utf8')).version;
const name = `opencode-buddy-${version}-${platform}-${process.arch}`;
const stage = join(outRoot, name);
const app = join(stage, 'app');

function run(command, commandArgs, cwd) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit' });
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

console.log('== compile bridge ==');
run(process.execPath, [join(repo, 'bridge', 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'], join(repo, 'bridge'));

console.log('== copy application ==');
cpSync(join(repo, 'bridge', 'dist'), join(app, 'bridge', 'dist'), { recursive: true });
cpSync(join(repo, 'bridge', 'package.json'), join(app, 'bridge', 'package.json'));
cpSync(join(repo, 'bridge', 'package-lock.json'), join(app, 'bridge', 'package-lock.json'));
cpSync(join(repo, 'plugin', 'opencode-buddy'), join(app, 'plugin', 'opencode-buddy'), {
  recursive: true,
  filter: (source) => !source.endsWith('.test.mjs') && basename(source) !== 'eslint.config.mjs',
});
cpSync(join(repo, 'scripts', 'lib'), join(app, 'scripts', 'lib'), { recursive: true });
for (const file of ['install-buddy-plugin.mjs', 'autostart.mjs', 'firmware-verify.mjs']) {
  cpSync(join(repo, 'scripts', file), join(app, 'scripts', file));
}
mkdirSync(join(app, 'bin', 'lib'), { recursive: true });
cpSync(join(repo, 'scripts', 'run-bridge.mjs'), join(app, 'bin', 'opencode-buddy-run.mjs'));
cpSync(join(repo, 'scripts', 'lib', 'supervisor.mjs'), join(app, 'bin', 'lib', 'supervisor.mjs'));
mkdirSync(join(app, 'firmware'), { recursive: true });
cpSync(join(repo, 'firmware', 'rc1-manifest.json'), join(app, 'firmware', 'rc1-manifest.json'));

console.log('== install runtime dependencies (no dev, no compile at user install) ==');
const npmArgs = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'];
// All arguments are fixed. The package directory is passed as cwd, never as shell code.
if (platform === 'win32') {
  run(join(process.env.SystemRoot, 'System32', 'cmd.exe'), ['/d', '/c', 'npm.cmd', ...npmArgs], join(app, 'bridge'));
} else {
  run('npm', npmArgs, join(app, 'bridge'));
}

const launcher = `#!/usr/bin/env node
// Portable launcher: no TypeScript, no npm, no global install.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '..', 'bridge', 'dist', 'cli', 'live.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
`;
mkdirSync(join(app, 'bin'), { recursive: true });
writeFileSync(join(app, 'bin', 'opencode-buddy.mjs'), launcher);

writeFileSync(
  join(stage, 'INSTALL.txt'),
  `OpenCode Buddy ${version} portable ${platform}/${process.arch}\n\n` +
    '1. Extract the archive.\n' +
    '2. Run: node install.mjs --prefix <directory> --plugin-project <project> --apply\n' +
    '   Linux user default: ~/.local/share/opencode-buddy\n' +
    '   Use --plugin-global only if you intend to modify the OpenCode user configuration.\n' +
    `3. Start: <prefix>/bin/opencode-buddy${platform === 'win32' ? '.cmd' : ''}\n` +
    '4. Optional startup: node install.mjs ... --autostart-output <file>\n\n' +
    'Node.js 22+ is required. SerialPort prebuilds are included; no compiler is needed.\n' +
    'No firmware is included or flashed; see firmware/rc1-manifest.json.\n',
);

// Copy the installer next to app/.
cpSync(join(repo, 'scripts', 'install-buddy.mjs'), join(stage, 'install.mjs'));
cpSync(join(repo, 'LICENSE'), join(stage, 'LICENSE'));
cpSync(join(repo, 'docs', 'licenses.md'), join(stage, 'THIRD_PARTY_NOTICES.md'));
cpSync(join(repo, 'docs', 'evidence', 'phase-6-sbom.json'), join(stage, 'sbom.cdx.json'));
mkdirSync(join(stage, 'windows'), { recursive: true });
cpSync(join(repo, 'installer', 'windows', 'install.ps1'), join(stage, 'windows', 'install.ps1'));
cpSync(join(repo, 'installer', 'windows', 'README.md'), join(stage, 'windows', 'README.md'));

console.log('== inventory ==');
let bytes = 0;
function count(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) count(path);
    else bytes += statSync(path).size;
  }
}
count(stage);
console.log(`stage=${stage} bytes=${bytes}`);

if (archive) {
  const tar = join(outRoot, `${name}.tar.gz`);
  run('tar', ['-czf', tar, '-C', outRoot, name]);
  const hash = createHash('sha256').update(readFileSync(tar)).digest('hex');
  writeFileSync(`${tar}.sha256`, `${hash}  ${basename(tar)}\n`);
  console.log(`archive=${tar}`);
  console.log(`sha256=${hash}`);
}
