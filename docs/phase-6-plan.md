# Phase 6 — plan (native compatibility, installation and distribution)

Date: 2026-11-27. **Checkpoint A is authorized and in progress.** Checkpoints B/C/D (physical
hardware validation) are not authorized. Phase 5 software is accepted; hardware validation is
deferred. The frozen RC1 firmware `dd7d1d57…` is never modified.

## 1. Entry state

| Item | Value |
| --- | --- |
| Phase 5 verdict | SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED |
| RC1 firmware | `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash |
| Code-identical rebuild | `f9cc72ee…`, 413 344 B |
| Device baseline | Phase 4.1 `2ff67b71…`, 411 232 B, preserved |
| Software baseline | bridge 126/126, plugin 27/27, preview 8/8, coverage 96.61/87.31, QA PASS |
| Reference environment | Native physical Windows/Linux; no VMware USB redirection |

## 2. Work packages

| Id | Work | Checkpoint A state |
| --- | --- | --- |
| P6-00 | Architecture and implementation plan | **Implemented** in `docs/phase-6-architecture.md`; this plan is reconciled with P6-00…P6-14 |
| P6-01 | Windows native IPC (Named Pipes) | **Implemented** behind `IpcEndpoint`; token + descriptor + lock; ACL best-effort; AUTOMATED/MOCK tests. Native Windows pipe/DACL verification pending |
| P6-02 | Linux native compatibility | **Preserved and tested**: Unix socket/token permissions, XDG paths, peer lifecycle, lock; AUTOMATED PASS |
| P6-03 | Cross-platform USB discovery | **Implemented**: 303a:1001 filtering, stable serial/path ordering, explicit serial/port, multiple-device error, no probing; AUTOMATED tests |
| P6-04 | Bridge installation and runtime | **Implemented portable Linux app tree**: compiled bridge, runtime-only dependencies, launchers, installer, supervisor; Windows build prepared, not native-verified |
| P6-05 | OpenCode plugin installation | **Implemented**: JSONC-preserving merge, dry-run, backup, idempotence, targeted uninstall; isolated fixture tests |
| P6-06 | Automatic startup | **Implemented generator + supervisor**: systemd --user definition, Windows hidden Startup script, bounded backoff; no real service registered |
| P6-07 | User configuration | **Implemented**: platform paths, strict schema, device selection, aliases, startup/diagnostics fields; docs/example |
| P6-08 | Management interface | **Design only**: CLI-first + optional native tray; no heavy GUI; substantial GUI requires approval |
| P6-09 | Windows packaging | **Prepared**: same app tree + user-scoped PowerShell/Inno Setup path; not built/run in Ubuntu; NATIVE VERIFIED NOT DONE |
| P6-10 | Linux packaging | **Implemented demo**: portable app tree + tar.gz/checksum; Debian package can reuse it later |
| P6-11 | Firmware management | **Design + manifest verifier**: RC1 SHA/size/app-only/rollback; no flash; initial full install distinguished |
| P6-12 | Updates and uninstallation | **Implemented installer/uninstall** for the app prefix, launcher and Buddy plugin entry; configuration preserved; offline-first |
| P6-13 | Automated tests | Added IPC/path/discovery/config/plugin-install/autostart/firmware/supervisor tests; existing gates preserved |
| P6-14 | Security, licensing, packaging inventory | Threat/ACL notes, dependency/SBOM/licence update; vulnerability status remains NOT VERIFIED |

## 3. Checkpoints

### Checkpoint A — native base and packaging (authorized)

Deliver cross-platform architecture, Windows Named Pipes, preserved Linux IPC, discovery,
installation architecture, plugin workflow, startup management, configuration, packaging scripts or
justified plan, firmware design, tests, SBOM/licensing, documentation, local commits and a concise
installation demonstration with isolated fixtures. **No flash, no physical test, no GitHub.**

### Checkpoint B — native installation and hardware (not authorized)

Native physical Windows/Linux install and execution; real USB discovery; approved RC firmware
installation; 20 genuine cold boots; 10 physical USB reconnections; 10 software resets; 10 bridge
restarts; delayed start; six physical dashboards; three languages; four gestures; preference
persistence; auto-return; renderer performance. Native Windows installer validation is part of this
checkpoint.

### Checkpoint C — stability (not authorized)

3600 s soak, 28 800 s endurance, final USB quality verification, final hardware performance
evidence. MOCK for soak/endurance; error injections separated; restore LIVE.

### Checkpoint D — final acceptance (not authorized)

Native installation/upgrade acceptance, clean uninstall validation, user documentation, pilot
preparation, final release acceptance.

## 4. Native verification matrix

| Area | AUTOMATED (Linux host) | NATIVE VERIFIED |
| --- | --- | --- |
| Unix IPC/socket/token | PASS | Linux native pending B |
| Windows pipe/descriptor/ACL | MOCK only | **not done** |
| Windows COM / Linux tty discovery | mocked | **not done** |
| Windows installer | not built | **not done** |
| Linux portable install/extract | PASS demo | native physical pending B |
| Plugin JSONC install/uninstall | PASS fixtures | native user config pending D |
| Startup definition generation | PASS | enabling/registration pending B/D |
| Firmware manifest verification | PASS | flash pending approval/B |
| Hardware cold boots/soak | not applicable | B/C |

## 5. Environment and constraints

- Native physical Windows 10/11 and Linux; no VMware USB redirection. The current VM is not the
  reference for acceptance.
- No GitHub operation, no flash without explicit approval, no physical manipulation, no wiring
  change, no global OpenCode configuration change during development, no TLS/proxy bypass.
- Preserve RC1, the Phase 4.1 rollback, all backups, diagnostic images and historical evidence.
- Preserve Codex Astra design, six screens, twelve states, EN/FR/DE, four gestures, device-owned
  preferences, NDJSON v1 and privacy.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Windows Named Pipes/DACL not natively verified | Token + per-user pipe + descriptor; native B tests; no TCP fallback |
| Windows SerialPort/native binding | Prebuilds included; native B install test |
| Auto-start privileges/console | User-scoped definitions; hidden Windows script; no elevation |
| Plugin config damage | Textual merge, dry-run, backup, targeted uninstall, fixtures |
| Firmware brick | App-only offset, manifest verify, rollback, explicit approval, no auto flash |
| Portable Node dependency | Document Node 22+; evaluate bundled runtime later |
| Hardware USB RX risk | Deferred to B/C on native physical; no VMware conclusion |

## 7. Deliverables

Checkpoint A: `docs/phase-6-architecture.md`, this plan, `docs/phase-6-report.md`,
`docs/configuration.md`, `docs/firmware-management.md`, installation docs, scripts, tests, SBOM/licence
updates and local commits. Later checkpoints add native evidence, final packages, release notes and
`docs/handover-phase6.md`.

## 8. Non-goals

No new product features, no Wi-Fi/Bluetooth, no telemetry, no remote approval/execution, no TCP
listener, no automatic firmware flash/update, no Electron/second dashboard, no change to the frozen
RC1 or Codex Astra design.
