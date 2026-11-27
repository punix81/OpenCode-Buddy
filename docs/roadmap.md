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

**Status: implemented; hardware link verified; measurement open.** Protocol ratified, firmware parser
and bridge complete, 36 automated tests and the firmware host suite passing. The image (372 250 B
flash, 20 420 B RAM) ran on three boards with a clean handshake, ACKs, heartbeats and all mock
scenarios; the 1-hour soak and the heap/FPS measurement remain open. See `docs/phase-2-report.md`,
`docs/evidence/phase-2-hardware-validation.md` and `docs/handover-phase2.md`.

## Phase 3 — OpenCode v2 integration — DELIVERED (with reservations)

**Goal:** real activity drives the companion.

Delivered: dependency-free plugin using `ctx.event.subscribe`; location filtering; allowlist
projection; Unix-socket IPC with per-run token; LIVE by default with MOCK only by explicit flag;
real states verified on hardware for THINKING, GENERATING, WORKING, SUCCESS and IDLE; real tokens,
model, agent, tool categories and MCP radar; session invalidation on plugin loss; reconnect.

Not validated live: a `permission.asked` and a `form.created` notification (no safe trigger without
interactive approval), a simultaneous pair of *active* executions (standalone runs serialize), a
second provider, and the Phase 2 one-hour soak. See `docs/phase-3-report.md` §17.

## Phase 3.1 — Independent audit remediation — COMPLETE (hardware validated)

**Goal:** correct the independent audit findings without changing the visual design.

Delivered: interaction priority separated from activity; per-session tokens/tools; per-peer session
ownership; supervised plugin subscription with ordered snapshots and bounded buffers; single-instance
IPC lock with UTF-8 bounds; authoritative MCP snapshots; most-recent-session focus; NVS writes only on
change; private sanitized plugin diagnostics; explicit cross-project isolation; bounded firmware TX
buffer; ACK expiry; USB re-discovery on reconnect; optional device-owned preferences behind a hello
capability.

Tests: bridge 85/85, plugin 24/24, protocol PASS, firmware host PASS, firmware build SUCCESS.
Flash, soak (61 min), performance measurements and physical validation are recorded;
one transient USB power-cycle handshake error is documented with automatic recovery. See
`docs/phase-3-1-report.md` and `docs/audit-phase-3-1.md`. Phase 4 has not started and awaits the
Product Owner's approval.

## Phase 4 — Developer dashboard — PASS WITH RESERVATIONS (Phase 4.1)

**Goal:** complete, readable six-screen experience.

Software delivered and physically reviewed: six dashboards with localized labels and state
vocabulary; `SESSION TOTAL` with compact k/M/B and a 64-bit wide sum; `CTX --`; deduplicated tool
counters; MCP complete totals with an eight-detail subset caption; System with the optional OpenCode
version; English/French/German with composed accents and switching without reboot; device-owned
preferences plus explicit host overrides; unchanged gestures; native preview sheets.

**Phase 4.1 resolution.** The cold-boot no-ACK was caused by a fragment of the device's own USB CDC
transmission being delivered into its RX and prefixed to the first `ready`. The parser now recovers a
complete frame behind an invalid prefix, the firmware drains RX while no host is connected, and the
bridge replays an unacknowledged handshake before reopening. Image
`2ff67b71…` is installed and verified; the bridge is LIVE with real OpenCode 2.4.1 data. The original
Phase 4 failure report is preserved in `docs/phase-4-report.md`.

Tests: bridge **103/103**, plugin **24/24**, protocol 12 valid/14 invalid, firmware host four suites,
preview 8/8. Performance: Buddy 47–48 ms / 20 FPS; Session/Tokens ~90–100 ms (Phase 5 optimization);
heap within 176 B of Phase 3.1; 0 TX drops.

**Final acceptance (2026-11-27):** installed image read back and matched (`2ff67b71…`); 4.1 suites
103/103, 24/24, protocol, host 4/4, preview 8/8, simulator PASS; **10/10** software resets, **10/10**
bridge restarts and a 60 s delayed start all handshook on the first attempt; **3600 s MOCK soak
PASS** (0 ACK timeout, 0 error, 0 resync, 0 reconnect, RSS stable). The **20 cold boots and 10 USB
reconnections were skipped** by the Product Owner, and the visual tour was not re-run on this exact
image; those are the reservations. A partial-ACK weakness found in the review is fixed in
`c4db0b3` (main) but not deployed in the accepted 4.1 runtime.

Phase 5 is paused; when it resumes it starts from the entry gates in `docs/phase-4-1-report.md` §11
and the audit in `docs/audit-phase-5.md`. See `docs/evidence/phase-4-1-*.md`,
`docs/dashboard-metrics.md`, `docs/localization.md` and `docs/device-preferences.md`.

## Phase 5 — Quality, privacy and stability

**Goal:** evidence that it is safe and stable.

Scope: unit, integration, protocol, reducer, gesture and privacy tests; fuzzing; disconnect storms;
multi-session stress; memory and CPU profiling; 8-hour hardware run; dependency and licence audit;
threat-model review.

Exit criteria: coverage targets met on the reducer and privacy filter; fuzz runs clean; soak passes;
audit findings closed or accepted; security sign-off.

**Status (2026-11-27): in progress — Checkpoint B accepted; Phase 5 NOT accepted.** The software
gates are green (126/126 bridge, 27/27 plugin, coverage 96.61/87.31, 288/288 pixel equivalence), but
the USB diagnostic campaign found a CDC RX stall after a watchdog/flash reset: the bridge can send
ready/config with no ACK until a real power cycle/replug. The pre-link backlog is an aggravating
factor, not the proven cause. RC1 `dd7d1d57…` remains the stable candidate; no final RC is flashed;
the 20 cold boots, 10 USB reconnections, 3600 s soak and 28 800 s endurance remain open. See
`docs/evidence/phase-5-usb-diagnostics.md` and `docs/handover-phase5.md`.

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
