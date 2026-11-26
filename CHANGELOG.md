# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from its first release.

## [Unreleased]

### Added — Phase 3, real OpenCode v2 integration

- `plugin/opencode-buddy`: dependency-free OpenCode 2.4.1 server plugin. Subscribes to
  `ctx.event.subscribe()`, filters on the event's `location.directory`, projects an allowlist of fields
  and forwards them over a local Unix socket. Never blocks the host; reconnects with 1 s → 15 s backoff.
- `bridge/src/ipc`: Unix-socket server in a 0700 directory, socket and token file in 0600, 256-bit
  per-run token checked in the first frame, bounded lines (8 KiB), rate limit (200/s, burst 400), up
  to eight authenticated peers (one per OpenCode location).
- `bridge/src/live`: live source that validates every message with the existing default-deny
  normalizer, anonymises MCP names (`MCP-1…8`) unless `allowRealMcpNames`, and invalidates sessions
  and pending counters when a peer disappears or stays silent for 15 s.
- `npm run live` / `npm start` (LIVE, default) and `npm run diagnose:opencode`.
- `scripts/install-buddy-plugin.mjs`: prints the exact configuration change, never rewrites the global
  OpenCode configuration; `--project DIR` writes a project-local config with a backup.
- `docs/opencode-v2-event-mapping.md`, `docs/opencode-integration.md`, `docs/plugin-installation.md`
  and the Phase 3 reports/evidence.

### Fixed — execution duration on the Session screen

- The chronometer no longer stays at 00:00 when the bridge attaches while an execution is already
  running: the plugin snapshot restores the start from `Session.Info.time.busy`, and the bridge falls
  back to the first phase event when even that is missing.
- The duration now measures one execution: it runs while active, freezes on the terminal value for the
  notification TTL, and returns to zero once the session is idle. A start left over from a previous
  execution can no longer leak into the next one.
- 4 bridge tests and 2 plugin tests added; bridge 56/56, plugin 13/13, typecheck clean.
- Diagnostics now include `elapsed=` in the state lines and the forwarded event kind at debug level.

### Fixed — plugin diagnostics and installer

- `npm run diagnose:opencode` now reads the global configuration **and** every project
  `opencode.json`/`opencode.jsonc` between the working directory and the repository root, so a
  project-local install reports `plugin configured (project)` instead of a false WARN. JSONC comments,
  the legacy `plugin` key and object entries are supported; a non-array `plugins` value fails loudly
  instead of being read as an empty list.
- `scripts/install-buddy-plugin.mjs` no longer presents a restart as mandatory and states the verified
  project-entry behaviour.
- 7 new tests (`bridge/test/opencode-config.test.ts`); bridge suite 52/52, typecheck clean.

### Fixed — plugin installation documentation

- `docs/plugin-installation.md` no longer presents `opencode service restart` as mandatory for a
  project-local plugin entry: on OpenCode 2.4.1 the running server picked it up without interrupting
  the agent session (verified, `docs/evidence/phase-3-plugin-reload.md`). The global configuration and
  plugin removal still require a restart, and the document says so.
- `docs/troubleshooting.md` now states the exact verified scope of configuration reload.

### Fixed — MCP radar on real data

- `mcp.status.changed` carries the changed server **name** only. The plugin now treats it as a
  trigger and re-queries `ctx.mcp.list()`, which is the only status source.
- The bridge caps the outbound server list at eight entries (protocol and firmware limit) while
  keeping the true `online`/`total` counts. Verified live: `mcp online=7 total=12`.

### Fixed — integration defects found on real data

- The plugin snapshot restored sessions from other projects served by the same OpenCode server
  (31.9 M input tokens at connect). Sessions are now scoped to the plugin's location and to the last
  15 minutes.
- `permission.list` is session-scoped; the snapshot asks per restored session and tolerates absence.
- MCP server names are anonymised before the registry so a real name cannot reach the USB protocol.

### Changed — companion display

- Redesigned all twelve expressions and six circular pages with shared indexed colors, fitted
  typography and a procedural optical face. Quiet mode holds a still expression.
- Dashboard counters preserve individual field availability. Wide derived token totals, independent
  context utilization and explicit bridge readiness carry through to the display.
- Added a loopback mock preview using the firmware renderer and local PNG review sheets.

### Fixed — Phase 2 hardware validation findings

- The device now re-announces `hello` while no bridge session is established, so a bridge started
  after the device boot can handshake; opening the USB port does not reliably reset the board.
- The device announces only while a USB host is attached, preventing buffered `hello` frames from
  being replayed as a burst that overflowed peer buffers.
- The bridge ignores a repeated `hello` with the same `boot` counter within 2 s of the handshake,
  which removes the redundant snapshot burst.
- The bridge no longer sets `dtr`/`rts`: this native USB CDC port rejects it with "Operation not
  supported" and the resulting port event was read as a fatal error.
- A serial port error is now handled as a link loss with backoff instead of a permanent `error`
  state, and an intentional `stop()` no longer logs a reconnect.
- `--log-level` is available on the bridge CLIs for hardware diagnosis.
- The USB CDC RX queue is enlarged to 1024 bytes in `setup()`: the core default of 256 bytes overflowed
  while a full-screen render blocked the loop, losing bytes mid-frame (`E_PARSE` + `resync`). 4096 was
  tried and left one unit unable to receive; 1024 is the validated value.

### Changed — display orientation and enclosure

- Panel rotation is now `kDisplayRotation` (`Config.h`), set to **1** (90°) for the printed PLA
  enclosure. The canvas is square and centred, so the layout does not change with rotation.

### Changed — Phase 2 board swap

- A second ESP32-C3 (rev v0.4, 4 MB XMC flash) replaced the validation unit. It was flashed with the
  complete image (bootloader, partition table, `boot_app0`, application), verified region by region.
- The Phase 1 4 MB dump belongs to the previous unit and must not be restored to the new one.
- `--after hard-reset` does not start the application on this board (RTS is not wired to EN); use
  `--after watchdog-reset`.

### Added — Phase 2 (USB protocol, bridge and simulator)

- Ratified NDJSON protocol v1: envelope, ten message types, field ownership, sequencing, ACK,
  resync, bounds, error codes, plus a normative JSON Schema, eleven examples and shared test vectors.
- Firmware `ProtocolParser` (no Arduino dependency) with bounded parsing, atomic state application,
  sequence/ACK/resync handling and encoders; host tests consume the same vectors.
- `SerialManager` refactored to non-blocking framing with a 2048-byte bound including the newline and
  overflow recovery.
- `bridge/`: TypeScript/Node.js bridge with validator, codec, transports, Espressif USB discovery,
  per-session registry, deterministic reducer, metrics deduplication, privacy projection, normalizer,
  mock adapter, device simulator and `mock` / `diagnose` / `simulate` CLIs.
- 33 automated TypeScript tests, firmware host tests and a protocol validation script.
- `bridge/README.md`, `simulator/README.md`, `docs/phase-2-report.md`, `docs/handover-phase2.md` and
  Phase 2 build/test evidence.
- Phase 2 build: **372 100 B flash (28.4 %)**, **20 412 B static RAM (6.2 %)**, image 406 368 B,
  SHA-256 `880f1444…09553cc4`, clean build 19.14 s, no warnings from Buddy sources.

### Changed — Phase 2 decisions

- The device owns the USB link and the firmware version; the bridge never sends `connection.usb` or
  `versions.fw`, and both are rejected if present.
- A missing required field maps to `E_PARSE`; a present out-of-range value is clamped and reported as
  `E_BOUNDS`.
- The bridge keeps one persistent serial connection (opening the port resets the ESP32-C3), gates
  writes behind a valid `hello`, and reconnects with 1/2/4/8/15 s backoff.
- Free-form serial diagnostics are disabled in the release build to protect the NDJSON stream.

### Changed — Phase 2 USB write path and validation tooling

- The firmware now writes each NDJSON frame and its newline in a single call through `FrameWriter`,
  checks the return value, and counts short writes, so a partial frame can never be glued to the next
  one. Host tests cover exact fit, one byte short, short write and oversized frame.
- `Serial.setRxBufferSize(1024)` stays; 4096 is documented as unvalidated and unsafe.
- Over-long `model` (40) and `agent` (24) values now return `E_BOUNDS`, matching the bridge validator;
  wrong types stay `E_PARSE`.
- The bridge records per-type send/receive counters (`bridge.stats`) and warns on `resync`, so a soak
  can compare what was sent with what the device acknowledged.
- New `stress` mock scenario: three sessions, continuous transitions, permissions, questions, retries,
  compaction, MCP changes and maximum-length text, used for the one-hour soak.
- `docs/evidence/phase-2-usb-validation.md` records what the core really does, including that the loop
  watchdog is disabled and that the cause of the earlier reset is NOT VERIFIED.
- `docs/phase-3-ipc-design.md` compares Unix socket, named pipe and TCP loopback for the future plugin
  transport and recommends a peer-credential-verified socket per platform.

### Verified — Phase 2 hardware validation

- The image ran on three ESP32-C3 boards: handshake, ACK per applied message, heartbeats, reconnection
  and all five mock scenarios with zero protocol error after the fixes.
- The 90° rotation was confirmed correct by the Product Owner for the printed PLA enclosure.
- Still open: a one-hour soak on the final image, and heap/FPS measurement with the diagnostic build.
  See `docs/evidence/phase-2-hardware-validation.md`.

### Added — Phase 1 validation, rollback and Phase 2 plan

- Hardware validation evidence: build, heap, render timing, FPS, 15-minute soak, five software
  restarts, gesture telemetry and human observation.
- Full 4 MB backup and verified restore of the reference firmware, with a rollback record.
- `docs/phase-2-plan.md`: protocol ratification, firmware parser, TypeScript bridge, simulator and
  test plan, awaiting Product Owner approval.
- `docs/handover-phase1.md` for resuming without the session context.

### Changed — GitHub ownership

- Remote GitHub operations (push, pull, fetch, issues, pull requests, releases, credentials) are now
  reserved for the Product Owner. Agents work locally only (`AGENTS.md` §8).
- The former blocker B-01 is reclassified as a Product Owner responsibility and removed from the
  development blockers.

### Added — Phase 1 (firmware core and animated Buddy)

- `firmware/`: PlatformIO project pinned to `espressif32@6.5.0` and LovyanGFX 1.2.21, with the
  verified pin map, a 220 × 220 8-bit canvas and USB CDC on boot.
- Procedural `BuddyFace` covering all twelve states, with shared eye geometry, text labels, ring and
  particle motion, and no stored image sequences.
- Non-blocking exclusive `TouchManager` gesture machine (short, double, long, very long).
- Six screens in `ScreenManager`, including the conditional context gauge and the MCP radar.
- `StateManager` with separate connection and execution state and terminal-state expiry.
- `PreferencesManager` in NVS and a clearly labelled `MockScenario` bench driver.
- Phase 1 build verified: 349 154 B flash (26.6 %), 16 316 B static RAM (5.0 %), clean rebuild in
  17.59 s with no warnings from Buddy sources.

### Added — Phase 0 (technical audit and initialization)

- Repository documentation scaffold: README, AGENTS, CONTRIBUTING, SECURITY, changelog, editor and
  attribute configuration.
- `docs/requirements.md`, `docs/architecture.md`, `docs/ui-design.md`, `docs/security.md`,
  `docs/roadmap.md`, `docs/installation.md`, `docs/troubleshooting.md`.
- `docs/hardware-audit.md`: verified GPIO map, display configuration and toolchain from the
  pre-existing reference firmware, plus identified electrical and coexistence risks.
- `docs/opencode-api-audit.md`: OpenCode 2.4.1 plugin/event/API audit with the observability matrix
  and documented limitations.
- `protocol/protocol-v1.md` and draft JSON Schema for the USB NDJSON protocol (design only, no
  implementation).
- Phase issue definitions and reproducible GitHub issue creation script.
- `docs/phase-0-report.md` with findings classified as VERIFIED / ASSUMPTION / NOT VERIFIED /
  BLOCKER.

### Changed — Phase 0 second verification pass

- `docs/opencode-api-audit.md`: added payload-level facts for the eleven highest-value v2 events, the
  privacy consequence, the re-verification evidence, and limitation L10 (`mcp.status.changed` carries
  no status).
- `docs/architecture.md`: terminal states are now session-scoped notifications with a bounded TTL, so
  a stale failure cannot mask live activity forever.
- `docs/security.md`: added `notifications` to the allowlist and stated the provenance of `versions`
  and `diagnostic.code`.
- `docs/ui-design.md`: corrected the page-indicator count to six; removed the unmeasurable USB speed
  class and the unsourced bridge uptime row; documented version sources.
- `protocol/protocol-v1.md`, `protocol/schemas/protocol-v1.schema.json`, `protocol/examples/state.json`:
  optional `versions` and `diagnostic` in the `state` snapshot, with a corrected size budget.
- `docs/phase-0-report.md`: current Git/remote facts, second-pass evidence, findings V-12–V-18,
  assumptions A-07–A-08, and §14 listing the five design defects found and resolved.

### Not yet implemented

- Firmware, bridge, plugin, simulator: intentionally untouched in Phase 0.
