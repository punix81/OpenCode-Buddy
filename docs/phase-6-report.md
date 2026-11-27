# Phase 6 — report (Checkpoint A: native base and installation)

Date: 2026-11-27
Status: **CHECKPOINT A COMPLETE for software and Linux-hosted automation.** Checkpoints B/C/D
(native physical installation, hardware acceptance, cold boots, soak/endurance, performance) are
**not authorized and not performed**. RC1 `dd7d1d57…` remains frozen; no firmware was flashed, no
serial port was opened, no physical device was manipulated and no GitHub operation was executed.

## 1. Summary

| Area | Result |
| --- | --- |
| Architecture | One bridge/plugin with platform adapters; decisions in `docs/phase-6-architecture.md` |
| Windows IPC | Named pipe behind `IpcEndpoint`, per-user descriptor, 256-bit token, PID lock, `icacls` best effort; AUTOMATED/MOCK only |
| Linux IPC | Existing Unix socket/token/permissions/peer lifecycle preserved; tests PASS |
| USB discovery | Strict `303a:1001` filter, deterministic selection, explicit multi-device error, no probing |
| Configuration | Strict shared schema, platform paths, device selection, aliases, startup/diagnostics fields |
| Plugin installation | JSONC-preserving merge, dry-run, backup, idempotence, targeted uninstall |
| Packaging | Portable Linux app tree (compiled bridge, 21 runtime packages, prebuilt SerialPort), launchers, installer, SHA-256; Windows wrapper prepared |
| Startup | systemd `--user` / hidden Windows Startup generated only to an explicit output; bounded-backoff supervisor |
| Firmware | RC1 manifest + read-only verifier; app-only offset and rollback documented; no flash |
| Quality gate | `scripts/qa.sh --coverage --firmware` PASS |
| Bridge tests | 139 / 139 PASS, coverage 96.55 / 86.42 / 88.29 |
| Plugin tests | 30 / 30 PASS |
| Script tests | 14 / 14 PASS |
| Preview tests | 8 / 8 PASS; protocol, firmware host tests, release build PASS |
| Firmware source | Unchanged; release rebuild digest `f9cc72ee…` equals the Phase 5 clean rebuild |

## 2. Work packages

| Id | Result |
| --- | --- |
| P6-00 | Architecture and plan written and reconciled (`docs/phase-6-architecture.md`, `docs/phase-6-plan.md`) |
| P6-01 | Windows named pipe implemented behind the shared endpoint; descriptor + token + lock; native DACL verification pending |
| P6-02 | Linux socket contract preserved; path/endpoint/lock tests pass |
| P6-03 | Deterministic discovery implemented with mocked lists |
| P6-04 | Portable bridge tree, launchers and installer implemented on Linux |
| P6-05 | Plugin installer implemented and tested on fixtures |
| P6-06 | Startup definitions and supervisor implemented; no service registered |
| P6-07 | Configuration schema, examples and docs implemented |
| P6-08 | Management interface: CLI-first design only; no tray/GUI implemented |
| P6-09 | Windows packaging prepared (PowerShell build/install, zip + checksum); not built on Windows |
| P6-10 | Linux portable archive demonstrated; Debian packaging deferred |
| P6-11 | Firmware manifest/verifier implemented; initial full installation explicitly out of scope |
| P6-12 | Update (replace prefix) and uninstall (prefix + launcher + Buddy plugin entry) implemented |
| P6-13 | New suites wired into the gate; all previous suites green |
| P6-14 | Threat model/security review addendum, SBOM, dependency and licence notes updated |

## 3. Files touched

Code and tooling:

- `bridge/src/ipc/endpoint.ts` (new), `paths.ts`, `server.ts`; `bridge/test/ipc-platform.test.ts`.
- `bridge/src/device/discovery.ts`; `bridge/test/discovery.test.ts`.
- `bridge/src/config.ts`, `cli/live.ts`, `live/source.ts`; `bridge/test/config.test.ts`.
- `plugin/opencode-buddy/index.js`, `plugin/opencode-buddy/ipc.test.mjs`.
- `scripts/lib/opencode-plugin-config.mjs`, `scripts/lib/supervisor.mjs`,
  `scripts/install-buddy-plugin.mjs`, `scripts/autostart.mjs`, `scripts/run-bridge.mjs`,
  `scripts/package-portable.mjs`, `scripts/install-buddy.mjs`, `scripts/firmware-verify.mjs`.
- `scripts/test/{plugin-install,autostart,supervisor,firmware-verify}.test.mjs`.
- `bridge/tsconfig.build.json` (new), `bridge/package.json` (build/test scripts).
- `installer/windows/{build.ps1,install.ps1,README.md}`.
- `firmware/rc1-manifest.json`.
- `scripts/qa.sh`, `scripts/lint.sh`; `bridge/config.example.json`, `config.example.json`.

Documentation, evidence and governance:

- `docs/phase-6-architecture.md`, `docs/phase-6-plan.md`, `docs/phase-6-report.md`,
  `docs/configuration.md`, `docs/installation.md`, `docs/firmware-management.md`.
- `docs/evidence/phase-6-checkpoint-a.md`, `docs/evidence/phase-6-sbom.json`.
- `docs/dependencies.md`, `docs/licenses.md`, `docs/security/threat-model.md`,
  `docs/security/security-review.md`, `docs/roadmap.md`.
- `README.md`, `AGENTS.md`, `CHANGELOG.md`.

No firmware source file was modified. No Phase 5 artifact, backup or report was altered.

## 4. Decisions

1. **One application, adapters.** Platform differences are confined to IPC endpoint, runtime paths
   and startup generation; state, protocol, security and privacy logic remain shared.
2. **No TCP fallback.** Windows uses a named pipe only. The enforceable controls are the per-user
   directory, a derived pipe name and a 256-bit per-run token; `icacls` is best effort because Node
   core exposes no pipe DACL. Native ACL verification is a Checkpoint B gate.
3. **No arbitrary device.** A single `303a:1001` candidate is selected; zero or several require
   `deviceSerial` or `port`, with the candidates listed. Discovery never opens ports.
4. **Runtime dependencies shipped.** TypeScript is compiled at build time and `npm ci --omit=dev`
   prepares the runtime tree; the user needs Node.js 22+ but no compiler. A bundled Node runtime is
   deliberately deferred (size/maintenance versus one-click).
5. **JSONC-safe plugin install.** Only the plugin array is edited textually; dry-run is the default,
   a timestamped backup precedes `--apply`, and uninstall removes only Buddy.
6. **Device owns preferences.** `language`/`quietMode` stay nullable host overrides; `null` never
   resets the device.
7. **Startup is opt-in and user-scoped.** Generation requires an explicit output; nothing is enabled
   or registered during development. The supervisor backs off 5 s → 30 s and exits on signals.
8. **Firmware stays manual.** The manifest verifier only reads and hashes. An application-only image
   is explicitly not an initial installation for a blank device.
9. **No new npm package.** Checkpoint A adds no runtime dependency; the SBOM reflects the existing
   SerialPort runtime tree.

## 5. Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `bash scripts/lint.sh` | PASS (ESLint + `.mjs` syntax) |
| `npm test` (bridge) | 139 / 139 PASS |
| `npm run test:plugin` | 30 / 30 PASS |
| `npm run test:scripts` | 14 / 14 PASS |
| `./scripts/qa.sh --coverage --firmware` | `QA PASS (coverage=1 firmware=1)` |
| `node scripts/package-portable.mjs --out /tmp/opencode/p6-final` | PASS; stage 3 184 881 B, archive 1 047 705 B, SHA-256 `a2387b7a…` (local build artifact) |
| `node install.mjs … --apply` / `--uninstall --apply` on an isolated fixture | exit 0; prefix removed; comment and MCP server preserved |
| `node dist/cli/simulate.js --scenario all-states` from the installed tree | exit 0 (MOCK) |
| `node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json --image … --plan` | OK, `dd7d1d57…`, 413 344 B, `0x10000`, plan printed, nothing executed |

The firmware release build recompiled the unchanged source to
`sha256 f9cc72ee…` (413 344 B), matching the Phase 5 code-identical rebuild. RC1 remains
`dd7d1d57…`; the known difference is the embedded ELF SHA/validation hash.

## 6. Verification classification

| Claim | Class |
| --- | --- |
| Linux-hosted unit, integration, script, protocol, host-firmware and preview tests pass | **VERIFIED** (this session) |
| Portable Linux tree builds, installs and uninstalls from a fixture | **VERIFIED** (this session) |
| Firmware source unchanged; rebuild digest matches the Phase 5 rebuild | **VERIFIED** (this session) |
| Windows named pipe, DACL, COM discovery, installer | **NOT VERIFIED** — AUTOMATED/MOCK on Linux |
| Native Linux physical installation/execution | **NOT VERIFIED** — Checkpoint B |
| Cold boots, USB reconnections, soak, endurance, six screens, performance | **NOT VERIFIED** — Checkpoints B/C/D |
| Vulnerability status | **NOT VERIFIED** — advisory endpoint unavailable; not "zero" |

## 7. Security findings

- No new network listener, telemetry, remote approval or remote execution path.
- The IPC token is generated per run, compared in constant time and never logged. The Windows
  descriptor is written with restrictive permissions where the platform supports it; `icacls`
  failure is logged but does not silently weaken the token/pipe-name controls.
- **Residual risk:** another process in the same Windows user session is inside the trust boundary;
  pipe DACLs are not native-verified. This is recorded as T18/T19/T25 and must be tested in
  Checkpoint B.
- The plugin installer validates the merged document, backs it up and changes only the plugin array;
  tests use isolated fixtures. A malformed or exotic JSONC input is refused rather than guessed.
- The Windows installer is unsigned; SmartScreen/Defender warnings must be documented and never
  bypassed. Signing is a Product Owner release decision.
- Firmware flashing remains manual, approved, verified and reversible; no automatic flash or update
  check exists.
- No secret, credential, absolute home path, employer/customer name or proxy detail was added to
  tracked files. `/tmp` demonstration paths and the local build digest are not committed artifacts.

## 8. Limitations

1. Windows named pipes, ACLs, COM ports and the PowerShell installer were not executed on Windows.
2. Native Linux installation was demonstrated from `/tmp` fixtures, not on a pristine physical host.
3. Node.js is a prerequisite; it is not bundled. A future one-click package must decide this and
   carry the Node notices.
4. No initial full-flash image or procedure exists for a blank ESP32-C3; RC1 is application-only.
5. The management interface is CLI-first and partly design-only; the optional tray is not
   implemented.
6. Debian/MSI packaging, code signing and an automatic update channel are not implemented (offline
   replacement is documented).
7. The hardware USB behaviour remains unresolved; this checkpoint neither reproduces nor diagnoses it.

## 9. Remaining work (not authorized)

- **Checkpoint B:** native Windows/Linux install and execution, real named pipe/ACL and COM/tty
  discovery, approved RC installation, 20 cold boots, 10 USB reconnections, 10 software resets,
  10 bridge restarts, delayed start, six physical dashboards, three languages, four gestures,
  preference persistence, auto-return and renderer performance.
- **Checkpoint C:** 3600 s soak, 28 800 s endurance, USB quality verification, performance evidence.
- **Checkpoint D:** native upgrade/uninstall acceptance, user documentation, pilot preparation and
  release acceptance.
- Product Owner: remote publication, signing decision, optional bundled Node runtime, optional
  Debian/MSI packaging.

## 10. Commit references

| Commit | Subject |
| --- | --- |
| `9c2a84b` | feat(ipc): support Windows named pipes behind the shared endpoint |
| `741b4a8` | feat(device): select the ESP32 deterministically and reject ambiguity |
| `485e5da` | feat(config): add a strict cross-platform configuration schema |
| `d6ded4c` | feat(scripts): install the OpenCode plugin without rewriting JSONC |
| `a473e9e` | feat(scripts): generate user-scoped startup and supervise the bridge |
| `497bf83` | feat(packaging): ship a portable app tree without a user-side toolchain |
| `7752ee1` | feat(firmware): verify the frozen RC1 image from a manifest |
| `961934c` | test(qa): gate the script, plugin-install and autostart suites |

This report and the Checkpoint A documentation are committed separately as a `docs:` change on top
of these commits. All commits are local; nothing was pushed.

## 11. Recommendation

Accept Checkpoint A as the **software and Linux-automation baseline** for Phase 6. Do not declare
Windows or native installation support until Checkpoint B runs on native physical hardware. Proceed
to Checkpoint B only on a **native physical Windows or Linux host**, with an explicit authorization
for the firmware/device steps; keep RC1 frozen and the Phase 4.1 rollback available. The immediate
next software action is a real native Windows run of `installer/windows/build.ps1` and
`install.ps1`, because that is the largest remaining unverified surface introduced here.

## 12. Checkpoint B progress on native Windows

The Checkpoint A report above is retained as historical evidence. The Product
Owner authorized Checkpoint B on the physical Windows host on 2026-11-27.

**NATIVE VERIFIED** Windows x64 package build, SHA-256, native SerialPort load
and enumeration, isolated install, reinstall, fixture upgrade/uninstall,
startup definition generation, actual pipe/runtime DACLs and real OpenCode
2.4.2 data to the bridge.

**AUTOMATED** Native PowerShell quality gate for the bridge, plugin, installer,
protocol, configuration and TypeScript distribution build. It complements
the Linux gate.

**BLOCKER** Windows denied the selected port's exclusive open while the
pre-existing bridge runtime was active. The real board handshake, data on
the panel and comparison with the historical USB RX condition remain open.
The frozen binary and per-device backups must be available and verified on
the native host before an approved flash. The application layout and
renderer source remain at the starting baseline.

The [independent audit](audit-phase-6-windows.md) lists findings and corrections.
The [Checkpoint B evidence](evidence/phase-6-checkpoint-b.md) links the native
IPC and USB observations. Remote publication is handled by the Product Owner.
