#!/usr/bin/env node
// Optional startup supervisor. It starts the portable bridge, waits with
// bounded exponential backoff when no compatible device is present, and exits
// cleanly on SIGINT/SIGTERM. It never flashes, never elevates and never opens
// the serial port itself.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nextDelay } from './lib/supervisor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const launcher = join(here, 'opencode-buddy.mjs');
let child = null;
let timer = null;
let stopping = false;
let delay = 0;

function stop(code = 0) {
  stopping = true;
  if (timer !== null) clearTimeout(timer);
  if (child !== null && !child.killed) child.kill('SIGTERM');
  process.exit(code);
}

function start() {
  if (stopping || child !== null || timer !== null) return;
  child = spawn(process.execPath, [launcher, ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('error', () => {
    child = null;
    schedule();
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    if (signal !== null) {
      stop(0);
      return;
    }
    if (code === 0) {
      stop(0);
      return;
    }
    schedule();
  });
}

function schedule() {
  if (stopping || timer !== null) return;
  delay = nextDelay(delay);
  timer = setTimeout(() => {
    timer = null;
    start();
  }, delay);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
start();
