# Phase 1 performance evidence

Date: 2026-11-24
Firmware: commit `6904717` line, instrumented build (`BUDDY_DIAGNOSTICS=1`, `BUDDY_BENCH_COMMANDS=1`)
Board: ESP32-C3 rev v0.4, 4 MB flash (device serial redacted)

All numbers below were produced by the firmware's own counters and read over USB CDC. Opening the
CDC port resets this board, so each measurement window used a single connection that stayed open;
see `docs/troubleshooting.md`.

## Build

| Metric | Value |
| --- | --- |
| PlatformIO | 6.2.0, `espressif32@6.5.0`, `esp32-c3-devkitm-1`, Arduino, C++17 |
| Library | LovyanGFX 1.2.21 |
| Flash used | 354 982 B of 1 310 720 (27.1 %) |
| Static RAM | 16 364 B of 327 680 (5.0 %) |
| Application image | 385 984 B, SHA-256 `35d69a86…100009da` |
| Clean build time | 17.59 s (uninstrumented), 21–26 s (instrumented, cold) |

## Memory at boot

| Point | Free heap (B) |
| --- | --- |
| Before canvas allocation | 304 684 |
| After canvas allocation | 252 088 |
| Canvas delta | 52 596 (48 400 canvas + 4 196 allocator overhead) |
| Minimum free heap (observed) | 251 860 – 251 904 |
| Largest contiguous block | 229 364 |

Heap is flat across a 15-minute run and across 5 software restarts: **no growth, no fragmentation
trend** at this workload.

## Timing

| Metric | Value |
| --- | --- |
| Setup entry → first frame | 323 998 µs ≈ 324 ms |
| Render average | 31.9 ms |
| Render maximum | 33.1 ms (33 062 µs over the soak) |
| Frame budget (active) | 40 ms → 25 FPS |
| Measured FPS, active states | 25 |
| Measured FPS, idle states | 15 (interval 66 ms, by design) |
| Measured FPS, offline | ~8–10 (interval 132 ms, by design) |
| FPS window average over 15 min | 21 (min 10, max 25, excluding command replies) |

The 20 FPS floor is met for active states (25 FPS). Idle and offline are deliberately slower to keep
the companion calm; this is a design choice, not a hardware limit.

## Stability

| Test | Result |
| --- | --- |
| Continuous run | 902 s, 359 diagnostic lines, 0 reconnects |
| Unexpected resets | 0 |
| Boot counter during soak | stayed 1 |
| Heap first → last | 252 088 → 252 088 B |
| Minimum heap | 251 900 B |
| Largest block minimum | 229 364 B |
| Software restarts | 5/5, boot 2→6, `reset=software`, `unexpected=0`, heap identical after each |

## Not measured

- Cold-boot time to first frame (the 324 ms figure follows a hard reset after flashing).
- Power consumption, regulator headroom, brown-out margin, panel temperature.
- Long-run behaviour beyond 15 minutes; an 8-hour soak remains Phase 5 work.
- Spatial partial refresh: the current design pushes the full 220 × 220 disc per animated frame.
