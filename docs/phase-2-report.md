# Phase 2 report — USB protocol, bridge and simulator

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy` (branch `main`, local commits only)
Status: **implementation complete; hardware validation pending. The Phase 2 firmware has not been flashed.**

## 1. Executive summary

Phase 2 delivers the ratified NDJSON v1 protocol, a bounded firmware parser with atomic state
application, a modular TypeScript bridge, a mock adapter and a device simulator. The protocol
specification, schema, examples and shared test vectors are consistent: schema validation, TypeScript
runtime validation and the firmware host parser all pass on the same vectors.

The firmware builds cleanly at **372 100 B flash (28.4 %)** and **20 412 B static RAM (6.2 %)**. That
is +17 118 B flash and +4 048 B static RAM over the Phase 1 baseline, explained below. The bridge has
33 passing tests and completes a real handshake, heartbeat and snapshot exchange against the
simulator without hardware.

What remains is physical: the release image is **not flashed**, so the hardware handshake, the
1-hour soak, and Phase 2 heap/FPS measurements are **not verified**. A validation procedure and an
explicit approval request are in §10.

## 2. Status

| Phase 2 task | Status |
| --- | --- |
| P2-01 protocol ratification | **Done** — ten draft defects applied and validated |
| P2-02 firmware parser | **Done** — build + host tests |
| P2-03 bridge | **Done** — typecheck + 33 tests |
| P2-04 USB robustness | **Implemented** — persistent connection, handshake gate, backoff |
| P2-05 simulator | **Done** — end-to-end smoke test |
| P2-06 automated tests | **Done** — protocol, bridge, reducer, metrics, privacy, firmware parser |
| Hardware handshake | **NOT VERIFIED** — pending flash |
| 1-hour soak | **NOT VERIFIED** — pending flash |
| Phase 2 heap/FPS | **NOT VERIFIED** — pending diagnostic build |

## 3. Completed tasks

1. Ratified protocol v1: framing, envelope, ten message types, field ownership, sequence/ACK rules,
   duplicates, gaps, version negotiation, bounds, unknown/unavailable values, transitions and
   post-resync ordering.
2. Applied D-01…D-10: removed bridge-owned `connection.usb` and `versions.fw`, documented the run
   identifier, fixed `ack`/`hello` semantics, defined notifications, token total, invalid screen
   indexes and the resync order.
3. Updated the JSON Schema, all ten examples and the shared test vectors.
4. Implemented `ProtocolParser` in C++ with bounded parsing, type/field validation, atomic state
   application, sequence tracking, ACK, resync, error codes and encoders.
5. Refactored `SerialManager` to non-blocking line framing with a 2048-byte bound and overflow
   recovery.
6. Implemented the TypeScript bridge: validation, codec, transports, discovery, registry, reducer,
   metrics, privacy, normalizer, mock adapter, simulator, handshake, heartbeat, snapshots and
   reconnect backoff.
7. Added `mock`, `diagnose` and `simulate` CLI commands with documented scenarios.
8. Added 33 TypeScript tests, firmware host tests and schema/vector validation.
9. Documented the protocol, bridge, simulator, firmware and Phase 2 status.

## 4. Files

Created:

```text
protocol/ratification-v1.md
protocol/test-vectors/{messages,sequence,boundaries}.json
bridge/package.json  bridge/package-lock.json  bridge/tsconfig.json
bridge/config.example.json  bridge/README.md
bridge/src/... (protocol, transport, device, state, metrics, privacy, normalize, adapters, simulator, cli)
bridge/test/*.test.ts (33 tests)
bridge/scripts/validate-protocol.ts
firmware/src/ProtocolParser.{h,cpp}
firmware/test/host/{run.sh,test_protocol.cpp}
docs/phase-2-report.md
docs/handover-phase2.md
docs/evidence/phase-2-build-summary.txt
docs/evidence/phase-2-test-summary.md
```

Modified: `protocol/protocol-v1.md`, `protocol/schemas/protocol-v1.schema.json`,
`protocol/examples/*`, `firmware/src/{main,SerialManager,ScreenManager,StateManager}.{h,cpp}`,
`firmware/include/{Config.h,BuddyState.h}`, `firmware/platformio.ini`, `firmware/README.md`,
`simulator/README.md`, `README.md`, `CHANGELOG.md`, `docs/phase-2-plan.md`, `docs/roadmap.md`,
`docs/troubleshooting.md`, `AGENTS.md`.

## 5. Protocol decisions

- The device owns the USB link and the firmware version; the bridge owns the bridge link, OpenCode
  availability, versions and all normalized metrics.
- A line is at most 2048 bytes **including the newline**: 2047 payload bytes are accepted, 2048 are
  rejected (`E_TOO_LONG`).
- Sequence numbers are per sender and per connection, starting at 1 with `hello`/`ready`; duplicates
  are ignored and re-acknowledged, stale frames are ignored, gaps request a resync and the next
  snapshot is applied atomically.
- Acks carry `data.ack` (the applied peer sequence); the envelope `seq` is the sender's own.
- A new `hello` starts a new bridge session; the bridge resets its sequence and sends config, a full
  state snapshot and MCP status, in that order.
- `null` means unavailable; `0` is a real value. Unknown enums are rejected and leave the previous
  state untouched; numeric out-of-range values are clamped and reported with `E_BOUNDS`.

## 6. Build results

| Metric | Phase 1 | Phase 2 | Delta |
| --- | --- | --- | --- |
| Flash | 354 982 B | **372 100 B** | +17 118 B (+4.8 pp of partition) |
| Static RAM | 16 364 B | **20 412 B** | +4 048 B |
| Image | 385 984 B | **406 368 B** | +20 384 B |
| Clean build | 17.59 s | **20.17 s** | +2.58 s |
| Source warnings | 0 | **0** | — |

Image SHA-256: `880f144449208c59a7779c561d4c1822dd41f5809d04825a0d65a26309553cc4`.
No warning or error originates from Buddy sources.

### Static RAM breakdown

- Serial line buffer increased from 512 to 2047 payload bytes: **+1 536 B**.
- Parser, codec tables and ArduinoJson-related statics: **+2 512 B**.
- The 48 400-byte canvas is unchanged and remains a runtime allocation.

### Dynamic memory

`ArduinoJson` parses each line into a temporary document that is released before the next message.
The allocation is bounded by the 2047-byte line, but the exact high-water mark is **not measured**
until the diagnostic build runs on hardware. No per-message retention exists in the parser: the
state is copied into `StateManager` only after validation.

## 7. Test results

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript typecheck | `npm run typecheck` | **PASS** |
| TypeScript tests | `npm test` | **33/33 PASS** |
| Protocol schema + vectors | `npm run validate:protocol` | **PASS** (11 valid, 13 invalid, 11 examples) |
| Firmware parser host tests | `firmware/test/host/run.sh` | **PASS** |
| Simulator end-to-end | `npm run simulate -- --scenario full-session --duration 9000` | **PASS** (handshake, snapshots, states) |
| Firmware clean build | `pio run` | **SUCCESS**, 20.17 s |

Covered: valid/invalid messages, missing required fields, wrong types, version mismatch, unknown
type, oversized line, invalid JSON, duplicate/stale/gap sequences, resync, ACK values, atomic state
preservation after invalid input, token total, mock source, config clamping, priority across
sessions, terminal TTLs, tool deduplication, token maxima, privacy projection, log redaction, bridge
handshake, mock source propagation, interactions, heartbeat timeout and version rejection.

**Not covered by automated tests:** USB serial on real hardware, Windows, 1-hour soak, battery/power,
display regressions after the parser was added, and touch regressions after the refactor.

## 8. Security findings

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| S-17 | Validator is default-deny at `data` level; unknown fields are rejected | Verified | Keep; vectors include unknown-field cases |
| S-18 | Normalizer accepts only explicit event fields; prompts/code/paths never enter the model | Verified | Tests assert extra fields are dropped |
| S-19 | Privacy filter rebuilds the outbound object field by field | Verified | Test covers extra fields and URL redaction |
| S-20 | Logs redact URLs/e-mails/paths; counters are not mistaken for paths | Verified | Regression test added |
| S-21 | Socket transport refuses non-loopback hosts | Verified by code | Keep |
| S-22 | Mock/simulator data is labelled `source=mock` and rendered `MOCK` | Verified | Keep |
| S-23 | No provider SDK, telemetry or cloud dependency | Verified | Keep |

No credential, prompt, response, code, path, tool argument or shell command is transmitted or logged.

## 9. Risks and limitations

1. **Hardware not verified**: the release image has never run on the panel. Handshake, parser timing,
   heap and FPS are unmeasured.
2. **ArduinoJson transient allocation**: bounded by the line size but not measured on the device;
   fragmentation risk exists and must be checked with the diagnostic build.
3. **Serial runtime**: `serialport` 13.0.0 loads on Node 24 and its native binding is present, but it
   has not opened the real device in this phase.
4. **Windows untested**: only Linux was exercised.
5. **1-hour soak not run**: the protocol reconnect paths are unit-tested but not soaked on hardware.
6. **No spatial partial refresh**: unchanged from Phase 1; the full 220 × 220 disc is pushed per
   animated frame.
7. **Diagnostics are off in the release build**, so Phase 2 heap/FPS require a separate diagnostic
   build that must not be used with the bridge.

## 10. Pre-flash validation procedure and approval request

The following session is proposed. It requires explicit approval because it replaces the Phase 1
firmware; the verified 4 MB reference backup remains available for rollback.

1. Confirm the backup hash `9a83841f…bd07479` and the restore script.
2. Flash the **release** application at `0x10000` with esptool 5.7.0 `--no-stub`; verify the image
   hash `880f1444…09553cc4`. Bootloader, partitions, otadata and NVS are not rewritten.
3. Open **one persistent** serial connection (`npm run diagnose -- --port /dev/ttyACM0 --duration 60000`)
   and verify: `hello` seq 1, `ready`/`config`/`state`/`mcp_status`, ACKs, heartbeats, no reset, no
   panic.
4. Run `npm run mock -- --scenario full-session --port /dev/ttyACM0`; verify all states, the
   permission prompt, success, and the `MOCK` badge.
5. Exercise the TTP223: short/double/long/very long; confirm `interaction` messages and screen
   changes, no double actions.
6. Unplug/replug USB; verify handshake, full snapshot and no bridge crash.
7. For Phase 2 heap/FPS: flash a diagnostic build (same code with `BUDDY_DIAGNOSTICS=1`), measure
   heap high-water, largest block, FPS and render time, then re-flash the release image.
8. Restore the reference firmware or keep Buddy, as the Product Owner decides.

**Approval requested:** authorise this validation session, including the temporary diagnostic build
for measurements.

## 11. Git references

All commits are local. Remote publication is handled by the Product Owner (`AGENTS.md` §8); no remote
operation was performed. Run `git log --oneline` for the current list.

## 12. Verdict

**Software: PASS. Hardware: NOT VERIFIED. Overall: PENDING HARDWARE VALIDATION.**

The implementation meets the Phase 2 software criteria: ratified protocol, compiling firmware,
functional bridge, usable simulator, validated schemas and vectors, robust handshake logic, invalid
input handling, reconnect design and privacy guarantees. Phase 2 is not complete until the hardware
session in §10 succeeds.

Phase 3 must not start before that validation and the Product Owner's review.
