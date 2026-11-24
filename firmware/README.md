# Firmware — ESP32-C3

Status: **Phase 2 implemented; hardware validation pending approval.** The firmware contains the
Phase 1 display/face/gesture/screen stack plus the ratified NDJSON v1 parser, handshake, heartbeat,
acknowledgement, resync and error handling.

It does not contain OpenCode event mapping; the bridge is the only source of normalized state.

## Hardware

The wiring and panel configuration are identical to the working `Codex-Quota-Mini` reference build
and are verified in [`../docs/hardware-audit.md`](../docs/hardware-audit.md) §1.

| Signal | GPIO |
| --- | --- |
| SPI SCLK | 2 |
| SPI MOSI | 4 |
| SPI MISO | not connected |
| Display DC | 1 |
| Display CS | 5 |
| Display RST | 0 |
| TTP223 output | 6 (active HIGH, internal pulldown) |

Panel: `Panel_GC9A01`, `SPI2_HOST`, 27 MHz, inverted colours, BGR order, rotation 0.
Toolchain: PlatformIO, `espressif32@6.5.0`, `esp32-c3-devkitm-1`, Arduino, C++17, USB CDC on boot.
Libraries: LovyanGFX 1.2.21, ArduinoJson 7.4.3.

## Components

| Component | Responsibility |
| --- | --- |
| `DisplayManager` | Panel init and the single 220 × 220 8-bit canvas. |
| `ScreenManager` | Six screens, layout, auto-return, quiet-mode behaviour. |
| `BuddyFace` | Procedural eyes, mouth, ring, particles and badges for all 12 states. |
| `AnimationEngine` | Time-derived blink, pulse and frame scheduling. |
| `StateManager` | Normalized state, metrics, link states, terminal-state expiry, mock source flag. |
| `TouchManager` | Debounced, exclusive gesture recognition. |
| `PreferencesManager` | NVS persistence: quiet mode, last screen, language slot. |
| `SerialManager` | Bounded, non-blocking USB CDC line framing (2048 bytes including newline). |
| `ProtocolParser` | NDJSON v1 validation, atomic state application, encoders, sequence/ACK/resync. |

`ProtocolParser` has no Arduino dependency, so it is covered by host tests using the same JSON
vectors as the TypeScript side.

## Protocol behaviour

- The device sends `hello` (seq 1) on boot, and re-announces every 3 s while no bridge session is
  established — opening the port does not reliably reset the board. It also sends `heartbeat` every
  2 s, `ack` for applied snapshots, `interaction` on gestures, `resync` on gaps and `error` on invalid
  input.
- Writes never block: a frame that does not fit the USB TX buffer is dropped and counted. Every message
  is either retried (hello, heartbeat), coalesced (ack) or superseded (state, mcp_status).
- It accepts `ready`, `config`, `state`, `mcp_status`, `heartbeat`, `ack` and `error`.
- A message is validated into a temporary structure and applied only if every field is valid; an
  invalid message never corrupts the previous state.
- USB link, bridge link and OpenCode state are separate. The device derives USB locally, the bridge
  reports its own link and OpenCode availability, and `unknown` is never rendered as `0`.
- `connection.usb` and `versions.fw` never come from the bridge.
- The firmware version is `0.2.0`; the protocol major is `1`.

## Rendering strategy

One 220 × 220 8-bit canvas (48 400 bytes) covers the visible disc. A frame is a single contiguous
`pushSprite`; dashboards push only when content changes. Animations are procedural and every state
has a text label, so no state depends on colour alone.

## Build

```sh
uv venv .venv
uv pip install --system-certs --python .venv/bin/python platformio
PLATFORMIO_SETTING_ENABLE_TELEMETRY=false .venv/bin/pio run -d firmware
```

`firmware/platformio.ini` is the reproducible definition. On a machine where the PlatformIO registry
is unreachable, the git-ignored `firmware/platformio.local.ini` links the cached LovyanGFX and
ArduinoJson copies.

## Tests

```sh
# Host tests for the parser, with the shared protocol vectors
firmware/test/host/run.sh
```

The host suite covers valid/invalid vectors, sequence duplicates/stale/gaps, ACK values, resync,
invalid input preserving the last state, token total computation, mock source, config clamping and
the 2047/2048-byte boundary.

## Bench instrumentation

`BUDDY_DIAGNOSTICS` and `BUDDY_BENCH_COMMANDS` are **off** in the Phase 2 release build, because
free-form serial diagnostics would collide with NDJSON. A separate diagnostic build can enable them
for memory/FPS measurement; it must not be used with the bridge.

## Verification status

- Build: **372 234 B flash (28.4 %)**, **20 420 B static RAM (6.2 %)**, image 406 560 B,
  SHA-256 `ea89ee2b…cd219779`; clean build with no warnings from Buddy sources.
- Host parser tests: **PASS** (includes a re-announcement/reset-session case).
- Hardware: **VERIFIED for the link** — the image was flashed (verified by esptool), the handshake,
  ACKs, heartbeats and all mock scenarios ran with no protocol error. See
  `docs/evidence/phase-2-hardware-validation.md`.
- Phase 1 runtime baseline for comparison: 25 FPS active, render average 31.9 ms, heap 252 088 B.

## What this firmware deliberately does not do

- It does not read OpenCode events; the bridge normalizes them.
- It cannot approve permissions, run commands or modify files.
- It does not enable Wi-Fi, Bluetooth or OTA.
- It does not display raw prompts, responses, code, paths or tool arguments.
