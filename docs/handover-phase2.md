# Phase 2 handover — OpenCode Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy`, branch `main`, local commits only
Audience: a developer or agent resuming the work without this session's context.

## Status in one paragraph

Phase 2 is **implemented and verified on hardware for the link**. The NDJSON v1 protocol is ratified,
the firmware parser compiles and passes host tests, the bridge completes real handshakes, and 36
automated tests pass. The image (**372 250 B flash, 20 420 B static RAM**, SHA-256
`76e85421…1c0f470c`) has been flashed and exercised on three ESP32-C3 boards, including the full-image
flash of two unknown units and the 90° rotation for the printed enclosure. The **1-hour soak and the
heap/FPS measurement are still open**; Phase 3 must not start before them and the Product Owner's
review.

## Verified facts

| Item | Evidence |
| --- | --- |
| Firmware clean build | SUCCESS, 0 warnings from Buddy sources |
| Flash / RAM | 372 250 B (28.4 %) / 20 420 B (6.2 %) |
| Image | 406 576 B, SHA-256 `76e854213f22a16332b65a43d6e5b63f2a63de9515950c3b39037be61c0f470c` |
| Source warnings | 0 from `firmware/src` and `firmware/include` |
| TypeScript typecheck | 0 diagnostics |
| TypeScript tests | 36/36 pass |
| Protocol validation | 11 valid, 13 invalid, 11 examples |
| Firmware host tests | PASS |
| Hardware link | **VERIFIED** on three boards — handshake, ACK, heartbeats, five scenarios, 0 error |
| 1-hour soak / heap / FPS | **OPEN** |

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

1. Run a one-hour soak on the current board (`npm run mock -- --scenario full-session --duration
   3600000`) and record resets, errors and ACK counts.
2. Build and flash a diagnostic image (`-DBUDDY_DIAGNOSTICS=1`), record heap high-water, minimum free
   heap, FPS and render time, then restore the release image.
3. Check all six screens and the four gestures through the enclosure.
4. Close Phase 2 with the measurement addendum.
5. Only then start Phase 3 (OpenCode plugin), which consumes the same normalized event contract.

Validated so far: handshake, ACK per applied message, heartbeats, reconnection, five mock scenarios,
duplicate-hello handling, recovery after a lost byte and the 90° rotation. See
`docs/evidence/phase-2-hardware-validation.md`.

## Device state

The current unit runs the Phase 2 release image (rotation 1). Two other boards were used during the
validation and replaced. The verified 4 MB dump in `.backups/phase1-2026-11-24/` (git-ignored,
SHA-256 `9a83841f…bd07479`) belongs to the **original** board and must not be restored to another
unit; the pre-Phase-2 application of that board is in `.backups/phase2-preflash/`.
