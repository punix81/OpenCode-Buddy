// Diagnostic bench probe for the MOCK measurement image (supermini-diag-bench).
// It owns /dev/ttyACM0, sends the bench-only navigation commands and records the
// BUDDY-DIAG telemetry. It is not a release tool and must not be run against a
// production firmware: the commands are only valid in the bench build.
//
//   node scripts/usb-probe.mjs --port /dev/ttyACM0 --out /tmp/diag.jsonl
//
// The device is explicitly MOCK; no OpenCode peer, no LLM cost, no bridge.
import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { SerialPort } = require('serialport');

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '/dev/ttyACM0' },
    out: { type: 'string', default: '/tmp/opencode/p5/render-measure.jsonl' },
    seconds: { type: 'string', default: '46' },
    settle: { type: 'string', default: '1200' },
  },
});
const portPath = values.port;
const outPath = values.out;
const windowMs = Number.parseInt(values.seconds, 10) * 1000;
const settleMs = Number.parseInt(values.settle, 10);

mkdirSync(dirname(outPath), { recursive: true });
const out = createWriteStream(outPath, { flags: 'w' });

const TEXT_FIELDS = new Set(['reset']);
function parseDiagnostic(line) {
  const fields = {};
  for (const token of line.trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    fields[key] = TEXT_FIELDS.has(key) ? value : Number(value);
  }
  return fields;
}

const scenarios = [];
for (const language of [0, 1, 2]) {
  for (const screen of [0, 1, 2, 3, 4, 5]) {
    scenarios.push({ language, screen, quiet: 0 });
  }
  scenarios.push({ language, screen: 0, quiet: 1 });
}

const port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false });
const lines = [];
let buffer = '';
let onLine = null;

port.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  for (;;) {
    const nl = buffer.indexOf('\n');
    if (nl < 0) break;
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.startsWith('BUDDY-DIAG')) continue;
    const fields = parseDiagnostic(line);
    fields.t = Date.now();
    out.write(`${JSON.stringify(fields)}\n`);
    lines.push(fields);
    onLine?.(fields);
  }
});
port.on('error', (error) => {
  console.error(`serial error: ${error.message}`);
  process.exitCode = 1;
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForDiagnostic(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onLine = null;
      reject(new Error('no BUDDY-DIAG line: is the bench image installed?'));
    }, timeoutMs);
    onLine = (fields) => {
      if (fields.stage !== undefined || fields['render_avg_us'] !== undefined) {
        clearTimeout(timer);
        onLine = null;
        resolve(fields);
      }
    };
  });
}

function send(command) {
  port.write(`${command}\n`);
}

function lastForScenario(startIndex) {
  return lines.slice(startIndex);
}

async function main() {
  await new Promise((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
  // The firmware drains RX until the CDC host flag is set; give it a moment,
  // then prime the line like the bridge does.
  await wait(500);
  port.write('\n');
  await waitForDiagnostic(10000);
  console.log(`bench image present; ${scenarios.length} scenarios`);

  const report = [];
  for (const scenario of scenarios) {
    send(`BUDDY-LANG ${scenario.language}`);
    send(`BUDDY-QUIET ${scenario.quiet}`);
    send(`BUDDY-SCREEN ${scenario.screen}`);
    await wait(settleMs);
    const start = lines.length;
    send('BUDDY-STATS-RESET');
    await wait(windowMs);
    const collected = lastForScenario(start).filter((line) => line['render_avg_us'] !== undefined);
    if (collected.length < 5) {
      throw new Error(
        `scenario ${JSON.stringify(scenario)} got only ${collected.length} diagnostic lines`,
      );
    }
    const first = collected[0];
    const last = collected[collected.length - 1];
    const elapsed = Math.max(1, last.t - first.t);
    const avgFps = ((last.push - first.push) * 1000) / elapsed;
    const row = {
      ...scenario,
      lines: collected.length,
      render_avg_us: last.render_avg_us,
      render_p50_us: last.render_p50_us,
      render_p95_us: last.render_p95_us,
      render_p99_us: last.render_p99_us,
      render_max_us: last.render_max_us,
      fps_avg: Number(avgFps.toFixed(2)),
      fps_window: last.fps,
      heap: last.heap,
      min: last.min,
      maxblk: last.maxblk,
      usb_gap_max_us: last.usb_gap_max_us,
      dropped: last.dropped,
      rx_ovf: last.rx_ovf,
      screen_seen: last.screen,
      state_seen: last.state,
    };
    report.push(row);
    console.log(
      `lang=${row.language} screen=${row.screen} quiet=${row.quiet} ` +
        `avg=${row.render_avg_us} p50=${row.render_p50_us} p95=${row.render_p95_us} ` +
        `p99=${row.render_p99_us} max=${row.render_max_us} fps=${row.fps_avg}`,
    );
  }

  writeFileSync(`${outPath}.summary.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report written to ${outPath}.summary.json`);
}

main()
  .catch((error) => {
    console.error(`probe failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    out.end();
    port.close(() => process.exit(process.exitCode ?? 0));
  });
