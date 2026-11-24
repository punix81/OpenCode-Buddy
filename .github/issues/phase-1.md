# Phase 1 — Firmware core and animated Buddy

## Objective

Deliver a buildable, non-blocking ESP32-C3 firmware that drives the exact proven hardware and renders the animated companion with locally generated mock states.

## Technical scope

- PlatformIO project pinned to `espressif32@6.5.0`, `esp32-c3-devkitm-1`, Arduino framework, USB CDC on boot.
- `DisplayManager` with GC9A01 and partial refresh; 8-bit sprite; no full 16-bit double buffer.
- `BuddyFace` + `AnimationEngine`: eleven states, procedural expressions, shared eye geometry.
- `TouchManager`: debounced gesture state machine (short, double, long, very long) with exclusive classification.
- `ScreenManager`: six screens with clearly marked mock metrics; `PreferencesManager` in NVS.
- Wi-Fi and Bluetooth disabled; no OTA.

## Implementation checklist

- [ ] Create PlatformIO project with the verified pin map.
- [ ] Render a static dashboard frame; verify panel orientation, inversion and colour order.
- [ ] Implement dirty-region refresh and measure frame time at 20/25/30 FPS.
- [ ] Implement all eleven faces and transitions (≤ 200 ms, no > 3 Hz flashing).
- [ ] Implement gesture state machine, including very-long-suppresses-long.
- [ ] Implement six screens, safe-area layout and page indicator.
- [ ] Implement quiet mode and 60 s auto-return.
- [ ] Persist language, quiet mode and last screen in NVS.
- [ ] Add a local mock state cycler for bench testing, labelled `MOCK` on the System screen.
- [ ] Measure flash, static RAM and heap high-water mark.

## Dependencies

Phase 0 approval. PlatformIO Core installed (currently missing on the audit machine).

## Acceptance criteria

- Firmware compiles cleanly with pinned dependencies.
- Display and touch verified on the real unit (with explicit approval to flash).
- 20 FPS floor measured, no visible flicker, no watchdog resets during a 30-minute animation run.
- Every state distinguishable without colour; every gesture produces exactly one action.
- Cold boot never enters download mode.

## Testing requirements

- Build log attached to the phase report.
- Frame-time and memory measurements on hardware.
- Manual gesture matrix (4 gestures × 6 screens) with observed results.
- Restore path for the previous firmware documented and exercised once.

## Expected deliverables

- `firmware/` implementation and build artefacts metadata (not binaries).
- Bench test procedure and results.
- Updated `docs/hardware-audit.md` findings (F-03, F-05) with measured outcomes.
- Phase 1 report.

## Gate

Hardware demonstration plus approval to proceed to the protocol and bridge.
