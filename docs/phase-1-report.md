# Phase 1 report — Firmware core and animated Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy` (branch `main`)
Status: **firmware implemented and compiling; hardware verification pending explicit approval to flash.**

Nothing was flashed. `/dev/ttyACM0` was not opened. The reference project was not modified.

## 1. Executive summary

The Phase 1 firmware exists and builds cleanly for the target board. A clean rebuild completed in
17.59 s with no warnings or errors from Buddy sources, producing a 378 336-byte image; PlatformIO
reports 349 154 bytes of flash (26.6 % of 1 310 720) and 16 316 bytes of static RAM (5.0 % of
327 680). The animated canvas (48 400 bytes) is allocated at runtime, so the realistic runtime heap
figure is roughly 65 kB, still well inside the budget.

The implementation covers the full Phase 1 scope: verified pins and panel parameters, one 8-bit
canvas, twelve procedural states, a non-blocking exclusive gesture machine, six screens, NVS
preferences, bounded serial framing and a clearly labelled mock driver. It does **not** parse the USB
protocol and does **not** claim a bridge or OpenCode connection; those are Phase 2/3.

Two environment obstacles were resolved without weakening security: PlatformIO Core was installed
into a project-local `.venv` using the system trust store (TLS verification stayed enabled), and the
unreachable PlatformIO registry was bypassed with a **git-ignored local override** pointing at the
already-cached LovyanGFX 1.2.21 from the reference project. The committed `platformio.ini` remains
the intended reproducible definition; its registry path is not verified on this machine.

What remains is exactly what cannot be done without the panel: flashing, visual inspection, touch
behaviour, frame rate and heap high-water measurement. Those are the Phase 1 gate and require
explicit approval, because the board currently runs the reference firmware.

## 2. Phase status

| Phase | Status |
| --- | --- |
| 0 — audit and initialization | Approved by the user |
| 1 — firmware core | Implemented; **build VERIFIED**, hardware **NOT VERIFIED** |
| 2 — protocol, bridge, simulator | Not started |
| 3 — OpenCode integration | Not started |
| 4 — dashboard | Not started |
| 5 — quality and security | Not started |
| 6 — packaging and pilot | Not started |

## 3. Completed tasks

1. Unblocked the toolchain without a system-wide install: PlatformIO Core 6.2.0 in a project-local
   `.venv`, using the cached `espressif32@6.5.0` platform.
2. Reproduced the verified hardware configuration: SPI 2/4, DC 1, CS 5, RST 0, 27 MHz, inverted,
   BGR order, rotation 0, touch GPIO6 active HIGH with a 35 ms debounce.
3. Implemented the component set: `DisplayManager`, `ScreenManager`, `BuddyFace`,
   `AnimationEngine`, `StateManager`, `TouchManager`, `PreferencesManager`, `SerialManager`,
   `MockScenario`.
4. Implemented all twelve visual states procedurally, with shared eye geometry and a text label per
   state, so no state depends on colour alone.
5. Implemented the exclusive gesture FSM: short, double, long (1.5 s), very long (5 s), with
   very-long suppression of long and short, and double-press merging of a pending short.
6. Implemented the six screens within the circular safe area, including a 270° context gauge that
   shows `CTX --` when the value is unavailable, and an MCP radar that draws only status classes.
7. Implemented quiet mode (no ambient animation, alerts still pulse), 60 s auto-return (disabled in
   quiet mode) and NVS persistence of quiet mode and last screen.
8. Implemented terminal-state expiry (`success` 4 s, `interrupted` 10 s, `error` 30 s) so a stale
   failure cannot mask later activity — the defect recorded as D-04 in the Phase 0 report.
9. Implemented bounded, non-blocking serial framing that counts lines and discards them, clearly
   documented as transport-only until Phase 2.
10. Compiled twice: an incremental build (20.95 s) and a clean rebuild (17.59 s), both successful.
11. Kept the mock path visibly labelled `MOCK` / `MOCK DATA`, and kept bridge/OpenCode at `UNKNOWN`
    rather than showing fake connectivity.

## 4. Files created or modified

Created:

```text
firmware/platformio.ini
firmware/include/Config.h
firmware/include/BuddyState.h
firmware/include/DisplayPanel.h
firmware/src/main.cpp
firmware/src/AnimationEngine.{h,cpp}
firmware/src/BuddyFace.{h,cpp}
firmware/src/DisplayManager.{h,cpp}
firmware/src/MockScenario.{h,cpp}
firmware/src/PreferencesManager.{h,cpp}
firmware/src/ScreenManager.{h,cpp}
firmware/src/SerialManager.{h,cpp}
firmware/src/StateManager.{h,cpp}
firmware/src/TouchManager.{h,cpp}
docs/phase-1-report.md
```

Modified:

- `firmware/README.md` — replaced the planning note with the implemented architecture and build
  instructions.
- `.gitignore` — ignores `.venv/` and the local `firmware/platformio.local.ini` override.
- `AGENTS.md` — added SOLID, explicit-error, reproducible-build, test and mock-labelling rules;
  updated the PlatformIO trap.
- `CHANGELOG.md`, `README.md`, `docs/roadmap.md`, `docs/architecture.md`, `docs/hardware-audit.md` —
  status and measured-resource updates.

Not created, intentionally: `firmware/platformio.local.ini` is local-only and ignored, because it
references a sibling project and must never become the distributed configuration.

## 5. Architectural decisions

| ADR | Decision | Why |
| --- | --- | --- |
| ADR-010 | One 220 × 220 8-bit canvas, full-canvas push | Covers the visible disc in one contiguous transfer (48 400 B), avoids tearing, and costs less than half of a 16-bit double buffer. |
| ADR-011 | Temporal refresh instead of spatial dirty regions | The Buddy screen animates the whole disc anyway; dashboards push only when content changes (≤ 8 FPS). Region-based partial push is deferred until a measurement shows it is needed. |
| ADR-012 | Mock data compiled behind `BUDDY_MOCK_MODE` and labelled on screen | A bench state cycler is necessary without a bridge, but it must never look like real data. |
| ADR-013 | Bridge and OpenCode report `UNKNOWN`, not `CONNECTED`, in Phase 1 | The firmware has no bridge and no parser; optimistic connectivity would be a lie. |
| ADR-014 | Gesture recognition is a pure state machine with one output per poll | Prevents double actions by construction and makes Phase 5 tests possible without hardware. |

## 6. Commands executed (evidence)

| Command | Observed result |
| --- | --- |
| `command -v pio` | not found |
| `uv venv .venv --python 3.12` | environment created at repository root |
| `uv pip install --system-certs --python .venv/bin/python platformio` | installed `platformio==6.2.0` |
| `.venv/bin/pio pkg install -l "lovyan03/LovyanGFX@1.2.21"` | registry path did not complete (`HTTPClientError`, then stall) |
| `.venv/bin/pio run -d firmware -c platformio.local.ini` | **SUCCESS**, 20.95 s |
| `pio run ... -t clean` then rebuild | **SUCCESS**, 17.59 s, no warnings from `src/` |
| `ls -l firmware/.pio/build/supermini/firmware.bin` | 378 336 bytes |
| `git -C ../Codex-Quota-Mini status --porcelain` | 0 lines |

PlatformIO summary from the clean build:

```text
RAM:   [          ]   5.0% (used 16316 bytes from 327680 bytes)
Flash: [===       ]  26.6% (used 349154 bytes from 1310720 bytes)
========================= [SUCCESS] Took 17.59 seconds =========================
```

## 7. Build results

- **VERIFIED:** the firmware compiles for `esp32-c3-devkitm-1` with `espressif32@6.5.0`, Arduino,
  C++17, USB CDC on boot.
- **VERIFIED:** zero warnings or errors attributable to Buddy sources in the clean build log.
  The framework emits one pre-existing warning in `esp32-hal-uart.c`, unrelated to this project.
  Sanitized evidence: [`docs/evidence/phase-1-build-summary.txt`](evidence/phase-1-build-summary.txt).
- **VERIFIED:** flash 349 154 B (26.6 %), static RAM 16 316 B (5.0 %), image 378 336 B.
- **NOT VERIFIED:** that the committed `platformio.ini` (registry dependency) resolves on a machine
  with the same proxy. It did not on this one; the build used the local override.

## 8. Test results

- **No hardware test was performed.** Nothing was flashed, no port was opened, no panel was observed.
- Static checks only: clean compile, no source warnings, bounded buffers, no `String` in firmware,
  no dynamic allocation in the steady-state path except the one canvas at boot.
- Gesture and reducer behaviour are designed for unit tests but have **no automated test yet**;
  that is Phase 5 work, and no claim is made that they behave correctly on hardware.

## 9. Security findings

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| S-09 | TLS interception was bypassed only by trusting the system store; verification stayed on | Informational | Never set `verify=false`; documented the correct approach |
| S-10 | The offline fallback references a sibling project | Low | File is git-ignored; committed config stays registry-based |
| S-11 | Serial input is read but not parsed | Informational | Lines are bounded and discarded; no parser exists to attack yet |
| S-12 | Wi-Fi and Bluetooth are never initialised; no OTA | Verified by design | Keep; Phase 5 asserts it in review |
| S-13 | Mock data is prominently labelled | Verified | `MOCK` on the Buddy screen, `MOCK DATA` on System |
| S-14 | NVS stores only quiet mode and last screen | Verified | No session data, no identifiers |

No credential, hostname, prompt, tool argument or file content exists in the firmware or its build.

## 10. Known limitations

- Display output, orientation, colour order, flicker, touch behaviour and frame rate are
  **unmeasured**. The 25 FPS target is a design budget, not a measurement.
- The 48 400-byte canvas allocation is expected to succeed (the reference allocated 57 600 B) but was
  not observed on this unit at runtime.
- Refresh is temporal, not spatial: the animated screen pushes the whole disc each frame. If the
  measured frame time is too high, dirty regions are the next optimisation.
- No USB protocol, no bridge, no OpenCode data. Bridge and OpenCode deliberately show `UNKNOWN`.
- Language selection is stored but not rendered; Phase 4 adds translations and font coverage for
  accented characters.
- GPIO0/GPIO2 boot-strapping behaviour remains an assumption until a cold boot is observed.

## 11. Remaining tasks and the Phase 1 gate

1. Explicit approval to flash the board, with the restore path agreed.
2. Flash the new image and observe: orientation, inversion, colour order, flicker, all twelve states.
3. Measure frame time / achieved FPS and heap high-water; record them here.
4. Exercise the gesture matrix (short, double, long, very long, auto-return) on the panel.
5. Confirm cold boot does not enter download mode.
6. Restore the reference firmware once, to prove the documented rollback works.

Until items 2–6 are done, Phase 1 is **not** complete by its own exit criteria.

## 12. Git and issue references

- Phase 0 baseline: `c9cb382` (local).
- Phase 1 implementation: committed after this report; the hash is not embedded here because a
  commit cannot contain its own hash.
- Issues: still **none created** — GitHub write access remains unavailable (B-01 from Phase 0).

## 13. Recommendation

Approve a single hardware verification session:

1. Stop the reference bridge process that currently owns `/dev/ttyACM0` (with the user's consent;
   never kill it automatically).
2. Flash the Buddy image once, measure and observe, then restore the reference firmware to prove the
   rollback path.
3. Only after those measurements, decide whether spatial partial refresh is needed before Phase 2.

The protocol and bridge work can start in parallel and does not depend on the panel; the firmware
serial parser will be the first Phase 2 task, against the ratified protocol.
