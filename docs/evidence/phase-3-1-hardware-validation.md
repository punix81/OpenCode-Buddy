# Phase 3.1 — hardware validation

Date: 2026-11-26
Device: ESP32-C3 Super Mini, 4 MB, `303a:1001`, `/dev/ttyACM0`.
Authorization: explicit Product Owner approval for the Phase 3.1 flash and hardware tests.
Final firmware: release image, sha256 `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad`
(read back from flash after the reflash and re-verified).

## 1. Backup before any write

| File | Size | SHA-256 |
| --- | --- | --- |
| `.backups/phase31-2026-11-26/full-flash-pre-phase31.bin` | 4 194 304 B | `246122bc8a6fafa63dae27c31fae2ef5ca4f90205db06626582124ddd742a702` |
| `.backups/phase31-2026-11-26/app-pre-phase31.bin` | 1 310 720 B | `2ee37e26674a383796b59c6a99a736c5bb19fc734564cdfa84448c471d868092` |
| `.backups/phase31-2026-11-26/firmware-phase31-release.bin` | 406 128 B | `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` |
| `.backups/phase31-2026-11-26/firmware-phase31-diag.bin` | 408 512 B | `b166b4a7f1f317ddd08c31c2208a044730a78505b435e9317e54817bc74f4633` |

The pre-flash full dump was read with esptool **5.7.0**, `--no-stub --after no-reset`, in 167.9 s.
The earlier UI-review backup was preserved. Nothing was restored.

Incident and recovery: the release PlatformIO build directory was removed by the diagnostic build. The
exact release image was recovered **from the device** (`read-flash 0x10000 0x63270`), its SHA-256 matched
`280166…e12ad`, and it was reflashed and verified before the final physical tests.

## 2. Flash

```
esptool --chip esp32c3 --port /dev/ttyACM0 --no-stub --after no-reset \
  write-flash 0x10000 firmware-phase31-release.bin
esptool --chip esp32c3 --port /dev/ttyACM0 --no-stub --after watchdog-reset \
  verify-flash 0x10000 firmware-phase31-release.bin
```

- Application only at `0x10000`; bootloader, partition table, otadata and NVS untouched.
- Write and independent verification: digest matched (twice: Phase 3.1 flash and final reflash).
- Watchdog reset; the device re-enumerated normally.

## 3. Protocol after the flash

| Check | Result |
| --- | --- |
| Boot / USB | normal, no panic, no watchdog loop |
| Handshake | `hello boot=1 caps=config.partial` |
| Capability use | bridge sends `config` without `language`/`quietMode` (176 B instead of the legacy 210 B) |
| NDJSON v1 | unchanged (`v:1`) |
| Heartbeats / ACK | 5 192 heartbeats, 10 479 ACKs in an 88-minute live window; 7 295 ACKs in the soak |
| Snapshot | full state + MCP after the handshake acknowledgement |
| Configuration errors | 0 on bridge restarts with the device already running |
| Graphical regression | none reported; six screens, animations and gestures intact |

## 4. Token verification (LIVE)

| Instant | API focus session | Bridge | Sum of all sessions |
| --- | --- | --- | --- |
| 10:04:07 UTC | 65 161 507 / 102 508 | 65 161 507 / 102 508 | 145 348 804 |
| 10:04:47 UTC | 68 329 545 / 104 045 | 68 329 545 / 104 045 | 148 516 842 |

Reasoning 133 182, cache read/write 0/0. The value is cumulative over the session's steps; CTX stays
`--`; no double counting, no aggregation. A probe session created without an execution reported 0/0 and
was created/closed correctly while the active session remained the focus.

## 5. Single-instance protection

- The first bridge takes the PID lock **before** opening the port.
- A second `npm run live` fails with `another bridge is running (pid …)` **before** any
  `live session on …` line; the first log shows no reset, error or resync.
- This exposed and fixed a real defect (the first implementation opened the port before the lock):
  commit `0d199ac`.

## 6. Preferences (F10/F12) — PASS

| Step | Log / observation |
| --- | --- |
| QUIET enabled by long press while the bridge was down | preserved by the firmware |
| Bridge restart with the device running | config sent **without** `quietMode`, QUIET still active (Product Owner confirmed); 0 error, 0 resync |
| MCU restart (diagnostic/release flash) | QUIET still active (Product Owner confirmed) |
| **USB unplug/replug** | `reconnecting` → 4 backoff attempts → `hello boot=1 caps=config.partial` → `ready` (device 011 → 012); QUIET still active (Product Owner confirmed) |
| **Very long press** | `interaction gesture=very_long` logged three times (13:53:30, 13:53:52, 13:54:02); RESET displayed, back to Buddy, QUIET disabled (Product Owner confirmed) |

The long press itself was logged as `interaction gesture=long screen=0` at 13:49:49, proving the
interaction path on the final release.

## 7. Soak test — PASS

See `docs/evidence/phase-3-1-soak-test.md`: 3 660.4 s, 3 647 state frames, 7 295 ACKs (avg 65 ms, max
490 ms), 0 expired ACK, 0 resync, 0 steady-state error, RSS constant at 56 404 kB, all nine states
covered. A single invalid line at the first message (buffered hello burst) was fixed afterwards by the
handshake-ACK gate (commit `be2b803`); the soak's steady-state results remain valid.

## 8. Performance — PARTIAL (4.5 min valid)

See `docs/evidence/phase-3-1-performance.md`: heap 245 812 B constant, largest block 225 268 B
constant, FPS average 18 (max 21), render average 47.2 ms / max 48.1 ms, 0 TX drops. The 15-minute
capture was interrupted at 13:29:39 by a USB re-enumeration (the Product Owner's physical test); the
firmware was still alive (`boot=1`, `reset=poweron`). The release image has no diagnostics by design;
the 61-minute release soak covers stability.

## 9. Residual hardware limitation

A USB **power-cycle/replug** can produce one transient `E_PARSE` + resync while the device is still
booting: at 13:50:18 the bridge had sent ready/config, the device had not acknowledged it, reported
`invalid message`, resynchronised, and the bridge re-sent `config`; the device acknowledged and the
snapshot followed. The LIVE view returned in about 2 s and no error occurred afterwards.

- Bridge restarts with the device already running: 0 error / 0 resync.
- USB replug/power cycle: one transient handshake error, automatic recovery.
- The handshake-ACK gate (state/mcp withheld until the device acknowledges ready/config) already
  removed the state-before-handshake error; the remaining case is an early config lost while the
  device boots. It is documented as a known limitation, not a blocker: no user-visible failure and
  automatic recovery.

## 10. Final state

- Release firmware `280166…e12ad` installed and verified; diagnostic image removed.
- LIVE bridge running (`tsx src/cli/live.ts`), real OpenCode 2.4.1 data, `mcp online=8 total=12`,
  cumulative focus-session tokens.
- Backups and the pre-flash full dump preserved for rollback.
- No GitHub operation was performed.
