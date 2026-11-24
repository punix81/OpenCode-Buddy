# Phase 1 report — Firmware core and animated Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy` (branch `main`, local commits only)
Status: **Phase 1 complete — PASS WITH RESERVATIONS.**
Rollback demonstrated and verified; Buddy is currently flashed again at the Product Owner's request.
Phase 2 has started with protocol ratification (documentation only).

## 1. Executive summary

The Phase 1 firmware is implemented, compiles cleanly, runs on the real ESP32-C3, and has been
validated on the panel. All twelve companion states render, the six screens are reachable through the
TTP223, quiet mode and the very-long-press reset work, preferences persist in NVS, and a 15-minute run
showed no reset and no heap growth.

The build uses 354 982 B of flash (27.1 %) and 16 364 B of static RAM (5.0 %); the 220 × 220 8-bit
canvas adds 52 596 B of heap. Rendering averages 31.9 ms with a 33.1 ms maximum, sustaining 25 FPS in
active states. A 4 MB full-flash backup was taken and verified before flashing; afterwards the device
was restored byte for byte and the reference bridge restarted. The Product Owner then asked to
re-flash Buddy, so the board currently runs Buddy again while the verified backup stays available.

Two points keep this from a clean PASS. Only 2 of the 5 requested cold boots are evidenced in the
kernel log, and several validations rely on human observation without a photograph. Both are recorded
as reservations, not failures.

A measurement error cost time and is worth recording: opening the CDC port resets this board, so the
first gesture tests read zero because every read wiped the counters. Keeping one connection open
immediately showed real gestures. That behaviour is now documented in `docs/troubleshooting.md`.

## 2. Phase status

| Phase | Status |
| --- | --- |
| 0 — audit and initialization | Approved |
| 1 — firmware core | **Complete, PASS WITH RESERVATIONS** |
| 2 — protocol, bridge, simulator | Planned (`docs/phase-2-plan.md`), awaiting approval |
| 3 — OpenCode integration | Not started |
| 4 — dashboard | Not started |
| 5 — quality and security | Not started |
| 6 — packaging and pilot | Not started |

## 3. Completed tasks

1. Installed PlatformIO Core 6.2.0 in a project-local `.venv`, using the system trust store and the
   cached `espressif32@6.5.0` platform. No system-wide change.
2. Implemented the firmware component set: `DisplayManager`, `ScreenManager`, `BuddyFace`,
   `AnimationEngine`, `StateManager`, `TouchManager`, `PreferencesManager`, `SerialManager`,
   `MockScenario`.
3. Implemented all twelve states procedurally, with a text label per state and shared eye geometry.
4. Implemented the exclusive gesture FSM (short, double, long, very long) and the six screens.
5. Implemented quiet mode, 60 s auto-return, terminal-state expiry and NVS preferences.
6. Implemented bounded, non-blocking serial framing; the NDJSON parser remains Phase 2.
7. Added validation instrumentation: heap, reset reason, boot counter, FPS, render timing, gesture
   latency and raw touch level, behind explicit build flags.
8. Took a verified 4 MB backup before flashing, including bootloader, partition table, otadata, NVS
   and both application slots.
9. Flashed the application at `0x10000` without rewriting the bootloader, partitions or NVS.
10. Validated display, states, gestures, navigation, quiet mode and persistence on the hardware.
11. Ran a 15-minute soak and 5 software restarts with flat heap and zero unexpected resets.
12. Restored the full 4 MB image, verified the digest, restarted the reference bridge, then re-flashed
    Buddy at the Product Owner's request.

## 4. Files created or modified

Created:

```text
firmware/platformio.ini
firmware/include/{Config.h,BuddyState.h,DisplayPanel.h}
firmware/src/main.cpp
firmware/src/{AnimationEngine,BuddyFace,DisplayManager,MockScenario,PreferencesManager,
              ScreenManager,SerialManager,StateManager,TouchManager}.{h,cpp}
docs/phase-1-report.md
docs/phase-2-plan.md
docs/evidence/phase-1-build-summary.txt
docs/evidence/phase-1-performance.md
docs/evidence/phase-1-hardware-validation.md
docs/evidence/phase-1-rollback.md
docs/handover-phase1.md
```

Modified: `firmware/README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `CHANGELOG.md`,
`docs/architecture.md`, `docs/hardware-audit.md`, `docs/roadmap.md`, `docs/troubleshooting.md`,
`docs/phase-0-report.md`, `.gitignore`, `.github/workflows/README.md`, `scripts/*.sh`.

Local-only and git-ignored: `.venv/`, `.venv-tools/`, `firmware/platformio.local.ini`, `.backups/`.

## 5. Architectural decisions

| ADR | Decision | Why |
| --- | --- | --- |
| ADR-010 | One 220 × 220 8-bit canvas, full-canvas push | Covers the visible disc in one contiguous transfer; less than half the memory of a 16-bit double buffer. |
| ADR-011 | Temporal refresh instead of spatial dirty regions | Active states animate the whole disc; dashboards push only on change. Spatial partial refresh is deferred until measured as necessary. |
| ADR-012 | Mock data behind `BUDDY_MOCK_MODE`, labelled on screen | Bench operation without a bridge, without pretending to be real data. |
| ADR-013 | Bridge and OpenCode report `UNKNOWN` in Phase 1 | No bridge and no parser exist; optimistic connectivity would be false. |
| ADR-014 | Exclusive gesture FSM with one output per poll | Prevents double actions by construction and makes Phase 5 testing possible. |
| ADR-015 | Flash the application only, restore the whole dump | Minimises write scope during tests; the full restore returns NVS and otadata exactly. |
| ADR-016 | README/AGENTS rule: remote GitHub is Product Owner territory | Keeps the agent local and removes a governance blocker from development. |

## 6. Commands executed (evidence)

| Command | Result |
| --- | --- |
| `pio run -d firmware -c platformio.local.ini` | SUCCESS, 17.59 s clean, no source warnings |
| `esptool --no-stub write-flash 0x10000 firmware.bin` | 385 904 B written, hash verified |
| `esptool --no-stub read-flash 0x0 0x400000 full-flash.bin` | 4 194 304 B, 168.9 s |
| `sha256sum -c SHA256SUMS.full` | OK |
| `esptool --no-stub write-flash 0x0 full-flash.bin` + `verify-flash` | digest matched |
| reference bridge restart | PID owned the port, no error lines |

Sanitized build evidence: `docs/evidence/phase-1-build-summary.txt`. Restore evidence:
`docs/evidence/phase-1-rollback.md`.

## 7. Build results

- **VERIFIED:** compiles for `esp32-c3-devkitm-1`, `espressif32@6.5.0`, Arduino, C++17, USB CDC.
- **VERIFIED:** flash 354 982 B (27.1 % of 1 310 720), static RAM 16 364 B (5.0 % of 327 680),
  image 385 984 B, SHA-256 `35d69a86…100009da`.
- **VERIFIED:** no warnings from Buddy sources; one pre-existing framework warning in
  `esp32-hal-uart.c`.
- **NOT VERIFIED:** that the committed registry-based `platformio.ini` resolves behind the proxy on
  another machine. The build used a git-ignored local override with cached LovyanGFX 1.2.21.

## 8. Test results

| Test | Result | Status |
| --- | --- | --- |
| Compile | clean, 17.59 s | VERIFIED |
| Display initialisation | canvas allocated, frames pushed | VERIFIED |
| Orientation, colours, readability, flicker | human observation | VERIFIED (human) |
| Twelve states | all observed in telemetry over 15 min | VERIFIED |
| Six screens via TTP223 | screens 0/1/2/5 in telemetry; all six human-confirmed | VERIFIED |
| Short gesture | 351–360 ms, one screen change per action | VERIFIED |
| Long gesture | 1 980 ms, reported on release | VERIFIED |
| Double gesture | human-confirmed; no double action observed | VERIFIED (human) |
| Very long gesture | human-confirmed reset | VERIFIED (human) |
| Quiet mode | human-confirmed; no ambient animation, alerts kept | VERIFIED (human) |
| NVS persistence | board returned to `screen=5` after reset | VERIFIED |
| 60 s auto-return | human-confirmed | VERIFIED (human) |
| 15-minute soak | 902 s, 0 resets, heap 252 088 → 252 088 B | VERIFIED |
| 5 software restarts | boot 2→6, `reset=software`, `unexpected=0` | VERIFIED |
| 5 cold boots | 2 kernel-evidenced (`reset=poweron`) | PARTIAL |
| Restore | 4 MB written, digest matched; reference bridge opened the port. Buddy then re-flashed at the owner's request. | VERIFIED (image) |
| Photo of the panel | not provided | NOT VERIFIED |

## 9. Security findings

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| S-09 | TLS interception handled with the system trust store; verification never disabled | Informational | Keep; documented |
| S-10 | Offline library fallback references a sibling project | Low | Git-ignored; committed config stays registry-based |
| S-11 | Serial input is framed but not parsed | Informational | Bounded and discarded; no parser to attack yet |
| S-12 | Wi-Fi and Bluetooth are never initialised; no OTA | Verified by design | Keep |
| S-13 | Mock data is labelled `MOCK` / `MOCK DATA` | Verified | Keep |
| S-14 | NVS stores only quiet mode, last screen and language slot | Verified | No session data |
| S-15 | Full-flash backup contains NVS and device identifiers | Medium (local) | Stored under `.backups/`, git-ignored, never transmitted; device serial redacted from committed docs |
| S-16 | Remote GitHub operations removed from agent scope | Governance | `AGENTS.md` §8; Product Owner only |

## 10. Known limitations and reservations

1. **Cold boots: 2/5 evidenced.** Two power cycles are in the kernel log with `reset=poweron`; the
   other three are covered only by human confirmation.
2. **No photograph** of the panel; visual validation is a human statement.
3. **Idle and offline FPS are below 20 by design** (15 and ~8–10). Active states sustain 25 FPS.
4. **No spatial partial refresh.** The animated frame pushes the whole 220 × 220 disc.
5. **Registry build path not verified** behind the proxy; the local override was used.
6. **Very-long-press telemetry** was not captured; it is human-confirmed.
7. **Power, brown-out and temperature** were not measured.

## 11. Remaining tasks

1. Product Owner approval to start Phase 2 (`docs/phase-2-plan.md`).
2. Optionally complete three more cold boots and attach a photograph.
3. Phase 2: ratify the protocol, implement the firmware parser, the TypeScript bridge and the
   simulator.

## 12. Git and issue references

All commits are **local**. Remote publication, issues, pull requests and releases are handled by the
Product Owner (`AGENTS.md` §8). Local commit sequence ends with this report; run `git log --oneline`
for the current list. No remote operation was performed for this phase.

## 13. Verdict and recommendation

**Verdict: PASS WITH RESERVATIONS.**

The firmware meets the Phase 1 functional gate: it builds, drives the exact hardware, renders all
states, navigates all screens, handles gestures without double actions, persists preferences, runs
15 minutes without reset or leak, and the rollback to the reference image was demonstrated and
verified. The board currently runs Buddy again at the Product Owner's request, with the reference
backup retained.

Recommendation: proceed to Phase 2 only after Product Owner approval. Phase 2 should start by
ratifying protocol v1 and implementing the firmware parser plus a mock-driven bridge, so the protocol
is proven on both sides before any OpenCode integration.
