# Phase 5 — coverage (Checkpoint B)

Date: 2026-11-27. Command: `scripts/qa.sh --coverage` (Node 24, `--experimental-test-coverage` with
tsx). Aggregate: **96.54 % lines, 87.20 % branches, 87.63 % functions** (goal 90/85 for critical
logic).

## Key modules

| Module | Lines | Branches | Functions | Notes |
| --- | --- | --- | --- | --- |
| `protocol/codec.ts` | 93.62 | 88.68 | 94.74 | framer, sequences |
| `protocol/validator.ts` | 97.49 | 88.97 | 100.00 | all message types |
| `state/reducer.ts` | 100.00 | 97.44 | 100.00 | status/focus/TTL |
| `state/registry.ts` | 97.45 | 82.42 | 85.71 | prompt-cap branches remain |
| `privacy/privacy.ts` | 100.00 | 85.42 | 100.00 | redaction/byte bounds |
| `ipc/messages.ts` | 100.00 | 89.29 | 100.00 | IPC schema |
| `ipc/lock.ts` | 100.00 | 100.00 | 100.00 | PID/stale lock |
| `ipc/paths.ts` | 100.00 | 87.50 | 100.00 | override/XDG/uid |
| `normalize/normalizer.ts` | 99.45 | 91.89 | 100.00 | 10 000-case corpus |
| `metrics/metrics.ts` | 93.85 | 90.74 | 92.86 | tool dedup/usage |
| `bridge.ts` | high | ~84 | high | I/O and reconnect paths |
| `ipc/server.ts` | 95.63 | 76.06 | 84.00 | error/symlink/timeout paths |
| `live/source.ts` | 94.33 | 79.27 | 90.00 | lifecycle/eviction paths |

## Per-module exceptions

`server.ts` (76 % branch), `source.ts` (79 %) and `registry.ts` (82 %) are below 85 % in branches.
The uncovered lines are OS error paths (symlink/ownership/hello timeout/rate limit) and rare
lifecycle branches, not the pure protocol/metric logic. They are listed from the coverage table and
are not excluded from the report. Raising them further would need fault-injection tests with real
sockets/processes; the aggregate and the critical modules meet the goal.

## How to reproduce

```sh
scripts/qa.sh --coverage
# the per-file table is in /tmp/opencode-qa-bridge.log
```

Coverage is a signal, not a target: no module was excluded and no test was added solely to move a
number.
