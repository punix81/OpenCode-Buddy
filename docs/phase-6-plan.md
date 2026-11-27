# Phase 6 — plan (native packaging and final acceptance)

Date: 2026-11-27. **Planning only.** Implementation starts only on a new explicit Product Owner
instruction. This plan transfers the Phase 5 hardware gates to a **native physical Windows or Linux
computer without USB virtualisation**. The current Windows-host + VMware Ubuntu USB-redirection
environment is **not** the reference environment; VMware is **not** a confirmed root cause.

## 1. Entry state

| Item | Value |
| --- | --- |
| Phase 5 verdict | **SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED** |
| Stable firmware | RC1 `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash |
| Code-identical rebuild | `f9cc72ee…`, 413 344 B (only ELF SHA / image validation hash differ) |
| Device baseline | Phase 4.1 `2ff67b71…`, 411 232 B, verified read-back |
| Bridge | 126/126, plugin 27/27, coverage 96.61 / 87.31 / 87.63, QA PASS |
| Open hardware risk | USB CDC RX/handshake stall after reset; root cause unproven; P1-02 |

All artifacts and failure evidence are frozen in `.backups/` and `docs/evidence/`; Phase 6 must not
delete or rewrite them. No functional RC1 change without explicit justification and authorisation.

## 2. Goal and exit criteria

**Goal:** a developer can install, run, update and uninstall OpenCode Buddy on a native physical
Windows or Linux computer using only the documentation, and the final product passes the hardware,
performance and endurance gates there.

Exit criteria:

- Native Windows and Linux install, first run, update and clean uninstall PASS from the docs.
- Windows Named Pipes IPC works with the same security properties as the Linux Unix socket.
- ESP32 auto-detection and bridge auto-start work on both platforms.
- 20 genuine cold boots, 10 USB reconnections, 10 software reboots, 10 bridge restarts and a delayed
  bridge start PASS on the final RC.
- USB quality re-tests PASS (or the residual defect is explicitly accepted by the Product Owner).
- Six screens, EN/FR/DE, four gestures, preferences and auto-return verified physically.
- Session/Tokens render timing measured on hardware; graphical equivalence preserved; target about
  50 ms or less for Session/Tokens without visual regression.
- 3600 s soak and 28 800 s endurance PASS in MOCK, with error injections separated.
- Rollback to `2ff67b71…` verified; no blocker; final product accepted.

## 3. Work breakdown

| Id | Work | Owner involvement | Output / acceptance |
| --- | --- | --- | --- |
| P6-00 | Native environment and baseline | physical host | Native Windows/Linux host without USB virtualisation; device and cable verified; artifacts hashed; no VMware in the acceptance path |
| P6-01 | Windows native compatibility | none beyond host | Bridge and plugin run natively; paths, permissions, signals, line endings, serialport native bindings; tests on Windows |
| P6-02 | Linux native compatibility | none beyond host | Bridge and plugin run natively on a physical Linux host; tests |
| P6-03 | Windows Named Pipes IPC | none | Design, ACL/token security, peer identity, reconnect; parity with the Unix-socket protocol; tests |
| P6-04 | Simplified bridge installation | none | Documented one-command/portable install; no admin rights by default; versioned dependencies |
| P6-05 | OpenCode plugin installation | none | Repeatable install/upgrade/uninstall of the plugin; no modification of unrelated user config without approval |
| P6-06 | ESP32 auto-detection | device present | VID/PID and serial discovery; no hard-coded port; clear error when absent; tests |
| P6-07 | Bridge auto-start | host | User-level service/autostart on Windows and Linux; starts after login; clean stop; no secret in logs |
| P6-08 | User configuration | none | Documented local config (port, language override, log level, source); validation and safe defaults |
| P6-09 | Packaging | none | Windows and Linux packages; pinned versions; checksums; SBOM; no telemetry; licence review |
| P6-10 | Firmware install/update | flash approval | Application-only `0x10000` flow with esptool; version check; verify and rollback to the preserved image; never touch bootloader/partitions/NVS |
| P6-11 | Clean uninstall | none | Removes bridge, plugin entry, autostart and local runtime files; preserves user data only by explicit choice; documented |
| P6-12 | User documentation | none | Install, first run, configuration, update, rollback, uninstall, troubleshooting; Windows and Linux |
| P6-13 | Native hardware validation | physical cycles and visual checks | 20 cold boots, 10 USB reconnections, 10 software reboots, 10 bridge restarts, delayed start; six screens, EN/FR/DE, four gestures, preferences, auto-return, real tokens, MCP, OpenCode version |
| P6-14 | USB quality re-tests | physical host | Repeat the P1-02 investigation on native USB only if it reproduces; bounded counters; no VMware conclusion; fix only with approval |
| P6-15 | Graphical performance validation | visual check | Six screens × three languages, MOCK and LIVE, p50/p95/p99, max, FPS caps, heap, largest block, USB gap, TX drops/RX overflows; compare with the Phase 5 baseline; preserve the Codex Astra design |
| P6-16 | Soak and endurance | none | 3600 s soak and 28 800 s endurance in MOCK; twelve states, ≥3 sessions, 12 MCP/8 details, status changes, permissions/questions, high values, near-limit frames; error injections separated; ACK/error/reset/resync/reconnect/RSS/CPU monitoring; restore LIVE |
| P6-17 | Final product validation | pilot user | A pilot completes install, flash, first run, update, uninstall using only the docs; no blocker; rollback verified; final report |

## 4. Order and checkpoints

1. **Checkpoint A — native base and packaging design.** P6-00/01/02/03/04/05/09/11/12 designed and
   implemented; Windows Named Pipes security reviewed; no device flash yet.
2. **Checkpoint B — native hardware acceptance.** P6-06/07/08/10/13/14/15: auto-detection, auto-start,
   config, firmware update flow, cold boots, reconnections, six-screen and performance validation on
   a native physical host. Any firmware change requires explicit justification and approval.
3. **Checkpoint C — stability.** P6-16: 3600 s soak and 28 800 s endurance, error injections
   separated, LIVE restored.
4. **Checkpoint D — final acceptance.** P6-17: pilot install/uninstall from the docs, final report,
   release notes, checksums, preserved artifacts.

## 5. Environment requirements

- Native physical **Windows 10/11** and a native physical **Linux** host; no VMware, no USB
  redirection, no remote USB.
- The ESP32-C3, known-good USB-C data cable and the documented wiring; no wiring change.
- esptool 5.7.0 for application-only flashes; explicit approval for each flash.
- Local repository only; no GitHub operation (Product Owner policy).
- OpenCode v2 pinned to the verified version; plugin installation documented.

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| USB RX/handshake stall recurs on native USB | P6-14 bounded re-test; preserve evidence; no root-cause claim until reproduced; fix only with approval |
| Windows serialport/native binding differences | Pinned versions, Windows CI/manual test, explicit error paths |
| Named Pipes ACL/token security | Threat model, user-only ACL, per-run token, tests; parity with Unix socket |
| Auto-start needs privileges | User-level autostart, documented fallback, no silent elevation |
| Firmware update bricks the app | Application-only write, verify, preserved rollback, explicit approval |
| Packaging/licence drift | Pinned dependencies, SBOM, licence review, checksums |
| Renderer regression during packaging | 288-image equivalence, tick-table check, hardware matrix |
| Soak/endurance invalidated by error injection | Separate phases, labelled injections, stable run first |

## 7. Deliverables

- Windows and Linux packages with checksums and SBOM.
- Native bridge/plugin install, update, uninstall scripts and docs.
- Named Pipes IPC implementation with security tests.
- ESP32 auto-detection, bridge auto-start and configuration docs.
- Hardware validation report with every attempt (failures included), cold-boot/reconnect evidence,
  six-screen and performance matrices, soak/endurance evidence.
- Final RC hash, rollback procedure, release notes, `docs/handover-phase6.md`.
- Updated `CHANGELOG.md`, `docs/roadmap.md`, `docs/phase-6-report.md`.

## 8. Non-goals

No new product features beyond the Phase 5 scope; no Wi-Fi/Bluetooth; no telemetry; no remote
approval or execution; no change to the Codex Astra design, six screens, twelve states, EN/FR/DE,
four gestures, device-owned preferences, NDJSON v1 compatibility or privacy model. No Phase 6
implementation before the Product Owner's next instruction.
