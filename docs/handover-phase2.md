# Phase 2 handover — OpenCode Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy`, branch `main`, local commits only
Audience: a developer or agent resuming the work without this session's context.

## Status in one paragraph

Phase 2 is **implemented and tested in software, but not validated on hardware**. The NDJSON v1
protocol is ratified, the firmware parser compiles and passes host tests, the TypeScript bridge
completes a real handshake against a device simulator, and 33 automated tests pass. The release
image (**372 100 B flash, 20 412 B static RAM**, SHA-256 `880f1444…09553cc4`) has **not** been
flashed. Phase 3 must not start before the hardware validation in `docs/phase-2-report.md` §10 and
the Product Owner's review.

## Verified facts

| Item | Evidence |
| --- | --- |
| Firmware clean build | SUCCESS, 19.14 s, 0 warnings from Buddy sources |
| Flash / RAM | 372 100 B (28.4 %) / 20 412 B (6.2 %) |
| Image | 406 368 B, SHA-256 `880f144449208c59a7779c561d4c1822dd41f5809d04825a0d65a26309553cc4` |
| Source warnings | 0 from `firmware/src` and `firmware/include` |
| TypeScript typecheck | 0 diagnostics |
| TypeScript tests | 33/33 pass |
| Protocol validation | 11 valid, 13 invalid, 11 examples |
| Firmware host tests | PASS |
| Simulator | handshake + snapshots + state progression over 9 s |
| Hardware | **NOT VERIFIED** — release image never flashed |

## What exists now

- `protocol/protocol-v1.md` — ratified wire contract (framing, envelope, ten message types, field
  ownership, sequencing, ACK, resync, bounds, error codes).
- `protocol/schemas/protocol-v1.schema.json` — normative JSON Schema.
- `protocol/test-vectors/{messages,sequence,boundaries}.json` — shared by the TS and C++ suites.
- `firmware/src/ProtocolParser.{h,cpp}` — bounded parser, atomic apply, encoders, ACK, resync.
- `firmware/src/SerialManager.{h,cpp}` — non-blocking framing, 2048-byte bound including newline.
- `firmware/src/main.cpp` — handshake, heartbeat, link timeout, gesture forwarding.
- `bridge/` — validator, codec, transports, discovery, registry, reducer, metrics, privacy,
  normalizer, mock adapter, simulator, bridge state machine and three CLIs.
- `bridge/test/` — 33 tests.
- `firmware/test/host/` — host test harness using the shared vectors.

## How to reproduce

```sh
# Firmware build
PLATFORMIO_SETTING_ENABLE_TELEMETRY=false .venv/bin/pio run -d firmware -c firmware/platformio.local.ini

# Firmware parser host tests (needs cached ArduinoJson headers)
firmware/test/host/run.sh

# Bridge
cd bridge
npm install
npm run typecheck
npm test
npm run validate:protocol
npm run simulate -- --scenario full-session --duration 20000
```

On a machine where the PlatformIO registry is unreachable, `firmware/platformio.local.ini` links the
cached LovyanGFX and ArduinoJson copies; it is git-ignored. The host test script locates ArduinoJson
through `$ARDUINOJSON`, defaulting to the reference project's libdeps; override it if the cache moved.

## Decisions taken in Phase 2

1. The device owns the USB link and the firmware version. `connection.usb` and `versions.fw` are never
   sent by the bridge and are rejected if present.
2. A line is capped at 2048 bytes **including** the newline; 2048 payload bytes return `E_TOO_LONG`.
3. A missing required field is `E_PARSE`; a present but out-of-range value is `E_BOUNDS` (clamped and
   reported). Unknown enums are rejected outright.
4. Parse into a temporary structure and apply atomically; an invalid message never mutates state.
5. The bridge opens the serial port once and keeps it open (opening resets the ESP32-C3), gates all
   writes behind a valid `hello`, and reconnects with 1/2/4/8/15 s backoff.
6. Mock and simulated data always carry `source: "mock"`, rendered as a `MOCK` badge.

## Traps rediscovered

- Opening `/dev/ttyACM0` resets the board and clears counters; keep exactly one connection open.
- The port is single-owner. The pre-existing reference bridge process held it during Phase 1; check
  with `lsof /dev/ttyACM0` before opening.
- `npm install` prints "unknown user config" warnings that come from the machine's npm configuration,
  not from this project.
- Free-form serial diagnostics are compiled out of the release build because they would corrupt
  NDJSON. Phase 2 heap/FPS measurement needs a separate diagnostic build.

## Next steps

1. Obtain explicit approval for the validation session in `docs/phase-2-report.md` §10.
2. Flash the release image at `0x10000` with esptool 5.7.0 `--no-stub`; confirm the image hash.
3. Run `npm run diagnose` (handshake, ACKs, heartbeats), then `npm run mock -- --scenario …`.
4. Exercise the touch gestures and a USB unplug/replug.
5. Measure heap and FPS with the diagnostic build, then restore the release image.
6. Write the Phase 2 hardware addendum and close the phase.
7. Only then start Phase 3 (OpenCode plugin), which consumes the same normalized event contract.

## Device state

The board currently runs the Phase 1 Buddy application. The verified 4 MB reference backup is in
`.backups/phase1-2026-11-24/` (git-ignored, SHA-256 `9a83841f…bd07479`) and is the rollback path.
