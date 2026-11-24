# Firmware — ESP32-C3

Phase 1 scope: the display core, the animated companion, the touch gesture machine, the six
screens and a clearly labelled mock data source. The USB protocol parser and the bridge arrive in
Phase 2; until then the firmware never claims a bridge or OpenCode connection.

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
Toolchain: PlatformIO, `espressif32@6.5.0`, `esp32-c3-devkitm-1`, Arduino, USB CDC on boot.

## Components

| Component | Responsibility |
| --- | --- |
| `DisplayManager` | Panel init and the single 220 × 220 8-bit canvas. |
| `ScreenManager` | Six screens, layout, auto-return, quiet-mode behaviour. |
| `BuddyFace` | Procedural eyes, mouth, ring, particles and badges for all 12 states. |
| `AnimationEngine` | Time-derived blink, pulse and frame scheduling. |
| `StateManager` | Normalized state, metrics, link state, terminal-state expiry. |
| `TouchManager` | Debounced, exclusive gesture recognition. |
| `PreferencesManager` | NVS persistence: quiet mode, last screen, language slot. |
| `SerialManager` | Bounded, non-blocking USB CDC line framing. |
| `MockScenario` | Bench state cycler, compiled only with `BUDDY_MOCK_MODE`. |

## Rendering strategy

One 220 × 220 8-bit canvas (48 400 bytes) covers the whole visible disc. A frame is a single
contiguous `pushSprite`, so there is no tearing and no 16-bit double buffer (which would cost
115 200 bytes). The animated Buddy screen pushes at 25 FPS active / 15 FPS idle; the five dashboard
screens push only when their content changes (≤ 8 FPS) and are static otherwise.

Animations are procedural: shapes, text and motion, never stored image sequences. Every state also
carries a text label, so no state depends on colour alone.

## Build

```sh
uv venv .venv
uv pip install --system-certs --python .venv/bin/python platformio
PLATFORMIO_SETTING_ENABLE_TELEMETRY=false .venv/bin/pio run -d firmware
```

`firmware/platformio.ini` is the reproducible definition. On a machine where the PlatformIO
registry is unreachable, a git-ignored `firmware/platformio.local.ini` can point at an already
cached LovyanGFX copy; it is a local convenience, never the distributed configuration.

## Bench instrumentation (Phase 1 validation only)

Two compile-time flags, both enabled in `platformio.ini` for Phase 1 and to be disabled when the
real protocol lands:

- `BUDDY_DIAGNOSTICS=1` prints one `BUDDY-DIAG ...` line every 5 s with reset reason, boot counter,
  unexpected-reset counter, free/min/largest-block heap, measured FPS, push count, average and max
  render time, last gesture latency, screen and state. It also prints a `stage=canvas` line at boot
  with the heap before/after canvas allocation and the setup-to-first-frame time.
- `BUDDY_BENCH_COMMANDS=1` accepts two exact lines on USB CDC: `BUDDY-DIAG` (print a diagnostic now)
  and `BUDDY-RESTART` (`ESP.restart()`).

These are **not** the USB protocol. They are clearly prefixed, documented here, and replaced by the
NDJSON protocol in Phase 2. Diagnostics are suppressed when the CDC transmit buffer is short, so a
missing host cannot stall the animation loop.

## What this firmware deliberately does not do

- It does not parse the NDJSON protocol yet. `SerialManager` frames and counts lines and discards
  them; no handler pretends to understand them.
- It does not report a bridge or OpenCode connection. Those fields stay `UNKNOWN` until the bridge
  exists and the protocol is implemented.
- It does not enable Wi-Fi or Bluetooth, and it has no OTA path.
- It cannot approve permissions, run commands or modify files. The touch pad has four navigation
  actions and nothing else.

## Verification status

- **Build VERIFIED (2026-11-24):** clean rebuild in 17.59 s; flash 349 154 B (26.6 % of 1 310 720),
  static RAM 16 316 B (5.0 % of 327 680), image 378 336 B; no warnings from Buddy sources.
- **Hardware NOT VERIFIED:** nothing was flashed. Display output, touch behaviour, frame rate and
  heap high-water are unmeasured, and the 25 FPS target is a design budget.

Full evidence, including the registry-proxy caveat, is in
[`../docs/phase-1-report.md`](../docs/phase-1-report.md). A build is only reported as successful when
the command actually completed; hardware behaviour is only reported when it was observed on the
panel.
