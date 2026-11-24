# Phase 1 hardware validation

Date: 2026-11-24
Board: ESP32-C3 rev v0.4, 4 MB flash (device serial redacted)
Firmware: instrumented Phase 1 build, application at `0x10000`, image
`385 984` B, SHA-256 `35d69a86…100009da`

## Human validation

The user observed the physical device and confirmed:

- correct screen orientation, colours and contrast;
- readable text, nothing clipped by the circular edge;
- no visible flicker; animations smooth;
- `MOCK` and the state label visible;
- TTP223 navigation works: short press cycles the six screens, double press returns to Buddy,
  long press toggles quiet mode, very long press resets preferences, 60 s inactivity returns to Buddy.

These are human observations, not automated assertions. No photograph was attached to the record.

## Telemetry captured during the same session

One serial connection was opened and **kept open**; the board was not reset during the window.
Values are from the firmware counters (`gesture_ms`, `touch_edges`, `screen`).

| Time (s) | Gesture | Latency (ms) | Edge count | Screen |
| --- | --- | --- | --- | --- |
| 105.5 | Short | 360 | 7 | 2 (TOKENS) |
| 110.5 | Short | 351 | 12 | 5 (SYSTEM) |
| 115.5 | Short | 360 | 14 | 0 (BUDDY) |
| 120.5 | Short | 360 | 19 | 1 (SESSION) |
| 125.5 | Short | 351 | 26 | 5 (SYSTEM) |
| 135.6 | Long | 1980 | 30 | 0 (BUDDY) |

Interpretation:

- The sensor is electrically working: `touch_raw` transitioned and `touch_edges` grew from 0 to 30.
- Short-press latency is ≈350 ms because a short press is reported only after the double-press
  window; this is the designed behaviour, not lag.
- A long press is reported on release, so its latency equals the hold duration (1.98 s here), which
  is correctly above the 1.5 s threshold.
- Each reported gesture changed the screen once: no double action was observed.
- Very long press was not captured in this telemetry window; it is covered by the user's human
  confirmation.

## Cold boots

- **2 power cycles are kernel-evidenced**: USB disconnect/reconnect with `reset=poweron`, boot
  counter reset to 1.
- 5 were requested. The user reports normal behaviour on the others, but only 2 are evidenced.
  Recorded as a reservation.

## NVS persistence

After a reset, the firmware returned to the persisted last screen (`screen=5`, SYSTEM) without a
gesture. This demonstrates that `PreferencesManager` persists the last screen across a reset.
Quiet-mode persistence is covered by the user's human confirmation.

## Method correction (important)

Earlier telemetry showed zero gestures because **opening the CDC port resets this board**, clearing
the gesture counters and restoring the persisted screen. The first measurements therefore described
the state after a reset, not the user's actions. Keeping a single connection open produced the
events above. This behaviour is documented in `docs/troubleshooting.md`.

## Not verified

- A photograph or video of the panel.
- Very-long-press telemetry (human-confirmed only).
- Five cold boots with kernel evidence.
- Power consumption, regulator headroom, brown-out margin.
