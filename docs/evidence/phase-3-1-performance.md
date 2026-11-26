# Phase 3.1 — firmware performance (diagnostic build)

Status: **PARTIAL — 4.5 min of valid samples**; the 15-min target was interrupted by a USB re-enumeration (firmware alive, `boot=1`, `reset=poweron`). The 61-min release soak covers stability.

## Method

- Build `[env:supermini-diag]`: same hardware configuration as the release, plus
  `BUDDY_MOCK_MODE=1` and `BUDDY_DIAGNOSTICS=1`. It runs the local mock scenario and prints
  `BUDDY-DIAG …` lines on USB CDC; it never speaks the production NDJSON protocol.
- Flash the diagnostic application at `0x10000` with esptool 5.7.0 `--no-stub`, verify, reset.
- Read the serial port for 15 min without the bridge (`/tmp/opencode/capture_diag.py`), then reflash
  the release image and verify its hash.
- Diagnostic build sha256: `b166b4a7f1f317ddd08c31c2208a044730a78505b435e9317e54817bc74f4633`;
  size 408 512 B, 22 604 B RAM / 374 276 B flash.
- The release build directory was removed by the diagnostic build; the exact release image was
  recovered from the device (`read-flash`), hash `280166…e12ad` matched, and it was reflashed and
  verified.

## Measurements (55 periodic samples, ~4.5 min)

| Metric | Value |
| --- | --- |
| heap | **245 812 B constant**; field minimum 245 568 B |
| largest contiguous block | **225 268 B constant** |
| FPS | average **18.0**, min 10 (state transitions), max 21 |
| render average | **47.2 ms** (47 180 µs), max **48.1 ms** (48 072 µs) |
| TX drops (`dropped`) | **0** |
| `txfree` minimum | 256 B |
| unexpected resets | none during the valid window (`boot=1`, `reset=poweron` at the capture open) |
| states covered | all 12 (0–11) |
| boot / canvas | boot line not captured intact (protocol interleaving); heap after canvas 245 812 B |

The diagnostic build still emits NDJSON hello/heartbeat frames alongside `BUDDY-DIAG`; the capture
parser extracts the intact diagnostic lines and ignores protocol noise. This is a diagnostic-only
build, never the release image. The capture stopped at 13:29:39 when the USB device re-enumerated
(006 → 008); the firmware was still running with `boot=1`, so this was a port re-enumeration, not a
firmware crash. The release image has no diagnostics by design; the 61-minute soak measured its
stability (0 error, 0 resync, constant RSS).

The release image does not expose heap/FPS: diagnostics are intentionally separate from the
production protocol. The release soak covers stability and USB; this run covers rendering/memory.
