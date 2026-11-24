# Phase 2 report — USB protocol, bridge and simulator

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy` (branch `main`, local commits only)
Status: **software complete and hardware-verified on the link; one-hour soak and heap/FPS measurement
still open.**

## 1. Executive summary

Phase 2 delivers the ratified NDJSON v1 protocol, a bounded firmware parser with atomic state
application, a TypeScript bridge, a mock adapter and a device simulator. The protocol specification,
schema, examples and shared vectors agree: schema validation, TypeScript runtime validation and the
firmware host parser all pass on the same data.

The software was then run on three physical ESP32-C3 boards. That session found seven real defects
that no unit test could have caught, all now fixed and re-verified: a handshake that could never
start, a fatal port error from modem-control calls, a buffered-hello burst, a watchdog reboot caused
by a blocking USB write, a mute device after an esptool reset, CDC RX overflow during rendering, and
a lost frame per connection. The details and evidence are in
`docs/evidence/phase-2-hardware-validation.md`.

What remains is measurement rather than correctness: a one-hour soak on the final board and the
heap/FPS figures from a diagnostic build.

## 2. Status

| Phase 2 task | Status |
| --- | --- |
| P2-01 protocol ratification | **Done** — eleven draft defects and eight hardware findings resolved |
| P2-02 firmware parser | **Done** — build + host tests + on-device behaviour |
| P2-03 bridge | **Done** — typecheck + 36 tests + real handshakes |
| P2-04 USB robustness | **Done and verified on hardware** — re-announcement, bounded writes, error recovery |
| P2-05 simulator | **Done** — end-to-end smoke test |
| P2-06 automated tests | **Done** — 36 bridge tests, host parser suite, schema/vector validation |
| Hardware link | **VERIFIED** — handshake, ACK, heartbeats, all five scenarios, no reset |
| 1-hour soak | **OPEN** — the first attempt exposed D-15 at 11 min; not re-run to completion |
| Heap/FPS on device | **OPEN** — requires the diagnostic build |

## 3. Completed tasks

1. Ratified protocol v1: framing, envelope, ten message types, field ownership, sequence/ACK rules,
   duplicates, gaps, version negotiation, bounds, unavailable values, transitions, resync ordering.
2. Applied D-01…D-10 from the ratification review, then D-11…D-19 from the hardware session.
3. Updated the JSON Schema, all examples and the shared test vectors.
4. Implemented `ProtocolParser` in C++: bounded parsing, validation, atomic application, sequence
   tracking, ACK, resync, error codes and encoders.
5. Replaced the blocking serial reader with non-blocking framing; added a bounded, counted writer and
   a 1024-byte CDC RX queue.
6. Implemented the bridge: validation, codec, transports, discovery, registry, reducer, metrics,
   privacy, normalizer, mock adapter, simulator, handshake, heartbeats, paced snapshots, reconnect.
7. Added `mock`, `diagnose` and `simulate` CLIs with `--log-level`.
8. Added automated tests on both sides and a protocol validation script.
9. Flashed and validated the image on three boards, including a full-image flash on unknown hardware.
10. Set the panel rotation (90°) for the printed enclosure.
11. Documented protocol, bridge, simulator, firmware, hardware findings, troubleshooting and handover.

## 4. Files

Created:

```text
protocol/ratification-v1.md
protocol/test-vectors/{messages,sequence,boundaries}.json
bridge/package.json  bridge/package-lock.json  bridge/tsconfig.json
bridge/config.example.json  bridge/README.md
bridge/src/... (protocol, transport, device, state, metrics, privacy, normalize, adapters, simulator, cli)
bridge/test/*.test.ts (36 tests)
bridge/scripts/validate-protocol.ts
firmware/src/ProtocolParser.{h,cpp}
firmware/test/host/{run.sh,test_protocol.cpp}
docs/phase-2-report.md
docs/handover-phase2.md
docs/evidence/phase-2-build-summary.txt
docs/evidence/phase-2-test-summary.md
docs/evidence/phase-2-hardware-validation.md
```

Modified: `protocol/protocol-v1.md`, `protocol/schemas/protocol-v1.schema.json`, `protocol/examples/*`,
`firmware/src/{main,SerialManager,ScreenManager,StateManager,DisplayManager}.{h,cpp}`,
`firmware/include/{Config.h,BuddyState.h}`, `firmware/platformio.ini`, `firmware/README.md`,
`simulator/README.md`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/{roadmap,phase-2-plan,
troubleshooting,hardware-audit}.md`.

## 5. Protocol decisions

- The device owns the USB link and the firmware version; the bridge owns the bridge link, OpenCode
  availability, versions and all normalized metrics.
- A line is at most 2048 bytes **including the newline**.
- Sequence numbers are per sender and per session, starting at 1. Duplicates are re-acknowledged,
  stale frames ignored, gaps recovered by `resync` and a full snapshot.
- A missing required field is `E_PARSE`; a present but out-of-range value is `E_BOUNDS` (clamped and
  reported); unknown enums are rejected and leave the previous state untouched.
- The device re-announces `hello` every 3 s while it has no bridge session, because opening the USB
  port does not reliably reset it.
- The bridge ignores a repeated `hello` with the same `boot` within 2 s, and splits the handshake into
  two groups so neither exceeds the device RX queue.

## 6. Build results

| Metric | Phase 1 | Phase 2 | Delta |
| --- | --- | --- | --- |
| Flash | 354 982 B | **372 250 B** | +17 268 B |
| Static RAM | 16 364 B | **20 420 B** | +4 056 B |
| Image | 385 984 B | **406 576 B** | +20 592 B |
| Source warnings | 0 | **0** | — |

Image SHA-256: `76e854213f22a16332b65a43d6e5b63f2a63de9515950c3b39037be61c0f470c`.

Static RAM delta: the serial line buffer grew from 512 to 2047 payload bytes (+1 536 B) and the
parser, codec tables and ArduinoJson statics add the rest (+2 520 B). The 48 400-byte canvas stays a
runtime allocation.

Dynamic memory: each line is parsed into a temporary ArduinoJson document released before the next
message; allocation is bounded by the line size. The high-water mark is **not measured** on device
yet.

## 7. Test results

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript typecheck | `cd bridge && npm run typecheck` | **PASS** |
| TypeScript tests | `cd bridge && npm test` | **36/36 PASS** |
| Protocol schema + vectors | `cd bridge && npm run validate:protocol` | **PASS** (11 valid, 13 invalid, 11 examples) |
| Firmware host tests | `firmware/test/host/run.sh` | **PASS** |
| Firmware clean build | `pio run` | **SUCCESS**, 0 warnings from Buddy sources |
| Hardware link | `npm run diagnose` / `npm run mock` | **PASS** — 0 error, 0 resync after the fixes |

Covered in software: valid/invalid messages, required fields, types, version mismatch, oversized
line, invalid JSON, duplicate/stale/gap sequences, resync, ACK values, atomic state preservation,
token totals, mock source, config clamping, cross-session priority, TTLs, tool deduplication, token
maxima, privacy projection, log redaction, handshake, hello deduplication, deferred snapshot,
interactions, heartbeat timeout and version rejection.

Covered on hardware: handshake, ACK per applied message, heartbeats, reconnection, five mock
scenarios, duplicate hello handling, error recovery after a lost byte, and the 90° rotation.

## 8. Security findings

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| S-17 | Validator is default-deny at `data` level | Verified | Keep; vectors cover unknown fields |
| S-18 | Normalizer accepts only explicit event fields | Verified | Tests assert extra fields are dropped |
| S-19 | Privacy filter rebuilds the outbound object field by field | Verified | Tests cover extra fields and URL redaction |
| S-20 | Logs redact URLs, e-mails and paths; counters are not mistaken for paths | Verified | Regression test |
| S-21 | Socket transport refuses non-loopback hosts | Verified by code | Keep |
| S-22 | Mock data labelled `source=mock` and rendered `MOCK` | Verified on device | Keep |
| S-23 | No provider SDK, telemetry or remote execution | Verified | Keep |

No credential, prompt, response, code, path, tool argument or shell command is transmitted or logged.
MAC addresses of the test boards are kept out of the repository.

## 9. Risks and limitations

1. **One-hour soak not completed** on the final image; the previous attempt failed at 11 min and the
   fix that addresses it is verified only over short runs.
2. **Heap and FPS not measured** on device; ArduinoJson fragmentation is bounded but unquantified.
3. **`setRxBufferSize(4096)` killed RX on one unit** for a reason that is NOT VERIFIED; 1024 is the
   shipping value and must not be raised without re-testing.
4. **Windows and macOS untested**; only Linux was exercised.
5. **No spatial partial refresh**: the full 220 × 220 disc is pushed per animated frame.
6. **Diagnostics are compiled out** of the release build, so heap/FPS need a separate image.
7. **Display and touch through the enclosure** were only partially re-checked after the rotation.

## 10. Hardware validation summary

Three boards were used. All received the Phase 2 image; the two replacements received the full image
(bootloader, partitions, `boot_app0`, application), verified region by region.

- Handshake, ACK, heartbeats and the five mock scenarios behave as specified on every unit after the
  fixes.
- The first unit reset after 11 minutes of soak because a blocking USB write stalled the loop and the
  watchdog fired; the writer is now bounded and counted.
- The 90° rotation is confirmed correct by the Product Owner for the printed PLA enclosure.

Full detail, including the defect table and the exact run list, is in
`docs/evidence/phase-2-hardware-validation.md`.

## 11. Remaining work

1. Run a one-hour soak on the current board with the final image; record resets, errors and ACK counts.
2. Flash a diagnostic build (`BUDDY_DIAGNOSTICS=1`), record heap high-water, minimum free heap, FPS
   and render time, then restore the release image.
3. Check all six screens and the four gestures through the enclosure.
4. Then, and only then, start Phase 3.

## 12. Git references

Local commits only; remote publication is handled by the Product Owner (`AGENTS.md` §8). Run
`git log --oneline` for the current list.

## 13. Verdict

**Software: PASS. Hardware link: VERIFIED. Measurement (1-hour soak, heap, FPS): OPEN.**

The phase meets its functional criteria: ratified protocol, compiling firmware, functional bridge,
usable simulator, validated schema and vectors, robust handshake and recovery, and privacy
guarantees — all exercised on real hardware. It does not yet meet the measurement criterion of a
one-hour link soak.

Phase 3 must not start before §11 items 1 and 2 are done and the Product Owner has reviewed this
report.
