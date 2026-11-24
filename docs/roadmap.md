# Roadmap

Seven phases, each with a review gate. A phase starts only after the previous gate is approved.
Every phase produces a report modelled on `docs/phase-0-report.md`.

```text
Phase 0 ─ audit ─► Phase 1 ─ firmware core ─► Phase 2 ─ protocol/bridge/simulator
   ▲                                                    │
   └──────────────── gate ◄─────────────────────────────┘
Phase 3 ─ OpenCode integration ─► Phase 4 ─ dashboard ─► Phase 5 ─ quality/security
                                                              │
                                                      Phase 6 ─ packaging/pilot
```

## Phase 0 — Technical audit and initialization

**Goal:** remove technical unknowns before writing code.

Deliverables: hardware audit with exact GPIOs and toolchain, OpenCode v2 API audit, requirements,
architecture, UI design, security design, protocol design draft, documented decisions, issue backlog,
this repository scaffold, Phase 0 report.

Exit criteria: every required signal either has a verified event source or a documented gap; hardware
map is traced to source; blockers are named with an owner; user approves the architecture.

**Status: complete and approved (2026-11-24).**

## Phase 1 — Firmware core and animated Buddy

**Goal:** a buildable firmware that drives the exact hardware and shows the companion.

Scope: PlatformIO project with the verified pins; `SerialManager` skeleton; `DisplayManager` with
temporal dirty refresh (spatial partial regions deferred until measured); `BuddyFace` +
`AnimationEngine`; all twelve states including OFFLINE rendered from a local mock state machine;
`TouchManager` gestures; `ScreenManager` with the six screens (mock metrics visibly marked);
`PreferencesManager` in NVS; Wi-Fi and Bluetooth disabled.

Deliverables: `firmware/`, build log, frame-time measurement, memory report, gesture test procedure.

Exit criteria: builds cleanly with pinned dependencies; display and touch verified on the real unit
with approval; 20 FPS floor measured; no flicker; all states distinguishable without colour.

**Status: complete — PASS WITH RESERVATIONS.** Build verified, hardware validated, device restored
to the reference firmware. See `docs/phase-1-report.md`; reservations are cold-boot sample (2/5),
human-only visual evidence, and idle/offline FPS intentionally below 20.

## Phase 2 — USB protocol, bridge and simulator

**Goal:** trustworthy transport between host and device.

Scope: ratify protocol v1 (messages, schemas, sequence handling, reconnection, version negotiation);
firmware serial + parser with hostile-input handling; TypeScript bridge with the component set in
`docs/architecture.md`; mock adapter; simulator; diagnostic mode; handshake/heartbeat/reconnect tests.

Exit criteria: handshake, snapshot on reconnect, sequence-gap resync, oversized/malformed rejection,
1-hour link soak with simulated resets, zero unbounded growth.

**Status: implemented; hardware validation pending.** Protocol ratified, firmware parser and bridge
complete, 33 automated tests and the firmware host suite passing. The release image (372 100 B flash,
20 412 B RAM) has not been flashed, so the hardware handshake, the 1-hour soak and the heap/FPS
measurements remain open. See `docs/phase-2-report.md` and `docs/handover-phase2.md`.

## Phase 3 — OpenCode v2 integration

**Goal:** real activity drives the companion.

Scope: plugin with `ctx.event.subscribe`; event mapping per the audit; permission and form alerts;
concurrent sessions; deduplication; usage semantics confirmed; failure isolation; DeepSeek and at
least one other provider tested; documented behaviour with the Buddy absent.

Exit criteria: a real execution changes state; permission request visible; success and failure
distinct; two concurrent sessions aggregate deterministically; OpenCode latency unchanged; no
prohibited field on the wire (capture test).

## Phase 4 — Developer dashboard

**Goal:** complete, readable six-screen experience.

Scope: all screens with real metrics; token/context handling; tool categories; MCP radar with aliases;
system screen; English/French/German; quiet mode; preferences; layout polish on hardware.

Exit criteria: every screen legible on the device; no invented value; language switch without reboot;
quiet mode semantics honoured; UI review approved.

## Phase 5 — Quality, privacy and stability

**Goal:** evidence that it is safe and stable.

Scope: unit, integration, protocol, reducer, gesture and privacy tests; fuzzing; disconnect storms;
multi-session stress; memory and CPU profiling; 8-hour hardware run; dependency and licence audit;
threat-model review.

Exit criteria: coverage targets met on the reducer and privacy filter; fuzz runs clean; soak passes;
audit findings closed or accepted; security sign-off.

## Phase 6 — Packaging and team pilot

**Goal:** another developer can install it without help.

Scope: Windows and Linux installers; flashing guide with restore path; release artefacts with
checksums; user, admin and troubleshooting docs; optional enclosure; pilot with a small team;
release notes.

Exit criteria: a pilot user completes install, flash, first run and uninstall using only the docs;
no blocker reported; rollback verified.

## Cross-phase rules

- No phase may relax a constraint in `docs/requirements.md` §4 without an explicit decision record.
- A blocker in one workstream does not stop independent work; it is documented and reported.
- Hardware claims require measurements taken in the same phase, on the real unit.
- Remote GitHub operations belong to the Product Owner. Agents work exclusively in the local
  repository; no push, pull, fetch, GitHub CLI/MCP/API, issues, pull requests or credentials
  (`AGENTS.md` §8).
