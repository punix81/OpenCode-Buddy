# Phase 6 — cross-platform architecture (Checkpoint A)

Date: 2026-11-27. This document records the architecture decisions for native Windows/Linux
compatibility and installation. It is the reference for the implementation; the plan and the
Checkpoint A report point here.

## 1. One application, platform adapters

There is **one bridge and one plugin**, not two applications. Platform differences are isolated in
small adapters:

| Concern | Shared | Unix adapter | Windows adapter |
| --- | --- | --- | --- |
| Bridge state/events/metrics | yes | — | — |
| IPC message/auth/rate/lock | yes (`ipc/server.ts`, `messages.ts`, `lock.ts`) | Unix socket endpoint | Named-pipe endpoint |
| Runtime paths | rule in `ipc/paths.ts` | `XDG_RUNTIME_DIR` / uid temp dir | `%LOCALAPPDATA%` per user |
| Serial discovery | `device/discovery.ts` | `/dev/ttyACM*` | `COMx` |
| Serial I/O | `transport/serial.ts` (SerialPort) | native binding | native binding |
| Startup | generated definition | systemd --user | Startup folder script |
| Packaging | portable app tree | tar.gz | native installer (later) |

The OpenCode plugin stays dependency-free. It and the bridge duplicate only the small runtime-path
rule; the Windows plugin reads the descriptor written by the bridge.

## 2. IPC transport (P6-01/P6-02)

- The existing Unix socket implementation is preserved byte-for-byte in behaviour: 0700 directory,
  0600 socket/token, 256-bit token, constant-time comparison, lock, hello timeout, rate limit,
  bounded line/queue, peer ownership and cleanup.
- Windows uses a Node `net` **named pipe**. The pipe path is derived from the absolute per-user
  runtime directory: `\\.\pipe\opencode-buddy-<16 hex>`. The bridge writes a 0600 runtime descriptor
  (`bridge.json`) containing `{v, platform, address, token, pid}`; the plugin re-reads it on every
  reconnect. The token is the same 256-bit token and is checked before any event.
- **No TCP listener** is introduced. There is no network endpoint.
- Access control: Node core does not expose a named-pipe DACL. The bridge makes a best-effort
  `icacls` call on the token and descriptor (`/inheritance:r /grant:r <user>:F`) and logs when it is
  unavailable. The enforceable layers that remain are the per-user directory, the unguessable pipe
  suffix and the 256-bit token. **This is not a claim that Windows DACLs are verified**: native
  Windows ACL/pipe verification is a Checkpoint B requirement. The `icacls` command construction is
  covered by AUTOMATED tests only.
- Single instance: the same lock file and PID check are used on both platforms. A failed start never
  removes a non-socket file or a live endpoint; the endpoint tracks whether it actually prepared
  files.
- The IPC abstraction is `IpcEndpoint` (`ensureDirectory`, `prepare`, `listen`, `cleanup`) with
  `UnixSocketEndpoint` and `NamedPipeEndpoint`. Message parsing, authentication, peers and lifecycle
  remain shared.

## 3. USB discovery (P6-03)

- `DeviceDiscovery` lists ports through SerialPort and keeps only Espressif `303a:1001` candidates.
  It never opens a port during discovery and never probes unrelated serial devices.
- Selection is deterministic:
  1. explicit `port` wins (advanced/CLI);
  2. explicit `deviceSerial` selects that candidate;
  3. exactly one candidate is selected;
  4. zero or multiple candidates produce a clear error listing the serial/path candidates; the user
     must set `deviceSerial` or `port`. There is no arbitrary "first device".
- The protocol hello remains the compatibility check after the selected port is opened. Firmware is
  never flashed as part of discovery.
- Tests use a mocked port list; they are AUTOMATED, not a Windows COM or Linux tty hardware test.

## 4. Configuration (P6-07)

- Runtime settings use one JSON schema (`bridge/src/config.ts`). Unknown keys are errors. Values are
  validated; no silent default for invalid input.
- Path precedence: `BUDDY_CONFIG` → an existing `config.local.json` in the development cwd → platform
  user config (`%APPDATA%\opencode-buddy\config.json` on Windows,
  `$XDG_CONFIG_HOME/opencode-buddy/config.json` or `~/.config/opencode-buddy/config.json` on Unix).
- New fields: `deviceSerial`, `autoStart` (installer preference), `diagnostics` (opt-in local
  diagnostics), `mcpAliases` (user-chosen aliases, never real names), alongside the existing
  `language`, `quietMode`, `autoReturnSeconds`, `allowRealMcpNames`, `logLevel`.
- `language`/`quietMode` remain **host overrides**; `null` means the device owns the preference and
  is never reset. `autoReturnSeconds` is a host runtime setting.
- `mcpAliases` maps real MCP names to bounded aliases; the bridge sends only aliases unless
  `allowRealMcpNames` is explicitly true. Duplicate aliases and control characters are rejected.
- The configuration schema and examples are documented in `docs/configuration.md` and
  `bridge/config.example.json`.

## 5. Installation and packaging (P6-04/P6-09/P6-10)

Options evaluated:

| Option | Verdict |
| --- | --- |
| Compile TypeScript at install | Rejected: requires a toolchain and network |
| Bundle JS with SEA/pkg/nexe | Rejected: native SerialPort addon and platform prebuilds make it fragile |
| Exposed TCP/HTTP installer service | Rejected by the security model |
| Portable app tree + pinned Node.js runtime + prebuilt SerialPort | **Selected** |

Selected shape:

```text
opencode-buddy-<version>-<platform>-<arch>/
  app/
    bridge/dist/            compiled JS (tsc build)
    bridge/node_modules/    runtime deps only (npm ci --omit=dev)
    plugin/opencode-buddy/  plugin + projections
    scripts/                plugin installer, autostart, firmware verify
    bin/opencode-buddy.mjs  direct launcher
    bin/opencode-buddy-run.mjs  supervisor with bounded backoff
  install.mjs               user-scoped installer
  INSTALL.txt
```

- Node.js 22+ is required; the runtime is not bundled in Checkpoint A. Bundling Node.js is a later
  decision (size vs. one-click); the native SerialPort prebuilds are the constraint.
- `npm ci --omit=dev --ignore-scripts` produces a ~3.2 MB runtime tree; it contains Linux, macOS and
  Windows prebuilds. It does not compile at user install.
- The build machine determines the archive platform. A Windows package must be built and executed on
  Windows; a Linux build is not a Windows native validation.
- Linux: a user-scoped portable archive installs under `~/.local/share/opencode-buddy` by default;
  the launchers live in `<prefix>/bin/` and the user adds that directory to `PATH` if desired. A
  Debian package can reuse the same app tree later.
- Windows: a user-scoped installer (PowerShell/Inno Setup) is prepared around the same app tree; no
  admin rights and no firmware flash. It is not built or validated in the Ubuntu VM.
- Uninstall removes only the app prefix, launcher and the Buddy plugin entry. It never removes
  OpenCode, unrelated plugins, MCP servers or a Node installation.

## 6. OpenCode plugin installation (P6-05)

- The installer edits **only the plugin array** of `opencode.json`/`opencode.jsonc` and preserves
  comments, providers, MCP servers, skills, agents and other plugins. It performs a textual insertion
  or removal, not a full rewrite.
- Dry-run is the default. `--apply` is required to write. A timestamped backup is created first.
- Installation is idempotent; duplicate Buddy entries are detected. Uninstall removes only Buddy.
- `--project` is the default safe target. `--global` exists but is never used against the real user
  configuration during development. Tests use isolated temporary fixtures.
- The plugin path remains an absolute directory entry; the installer prints the exact change.

## 7. Startup and management (P6-06/P6-08)

- Startup is optional and user-scoped: a systemd `--user` unit on Linux, a hidden user Startup
  script on Windows. The generator never enables or starts a real service; it requires an explicit
  output path and `--apply`.
- The bridge supervisor restarts the direct launcher with bounded exponential backoff
  (5 s → 30 s). It is not a busy loop and it exits cleanly on SIGINT/SIGTERM. OpenCode works without
  a Buddy and without a bridge.
- Management interface proposal: a **CLI first** (`doctor`, `status`, `start`, `stop`, `logs`,
  `config`, `firmware plan`) with a later optional native tray that calls the same operations. No
  Electron and no second dashboard. A substantial GUI requires a separate approval and design
  review. Checkpoint A implements the installer and generated startup definitions; the tray is not
  implemented.

## 8. Firmware management (P6-11)

- The frozen RC1 manifest (`firmware/rc1-manifest.json`) records SHA-256, size, protocol/version,
  app-only offset and the verified rollback image.
- `scripts/firmware-verify.mjs` verifies an image against the manifest and prints a flash plan; it
  never runs esptool. A flash requires explicit approval, a stopped bridge, an identified device,
  application-only write at `0x10000`, independent read-back and rollback preservation.
- An application-only image is **not** an initial installation. A blank ESP32-C3 needs a separately
  approved full bootloader/partition/application installation; the RC1 manifest states this.
- No automatic firmware update and no network update check.

## 9. Updates and uninstall (P6-12)

- Offline update first: replace the app tree, keep the configuration and plugin entry, restart.
- Uninstall: plugin entry removal (backup), app prefix/launcher removal, optional startup file
  removal. Firmware is not erased. Backups and diagnostic logs are preserved unless explicitly
  deleted.
- No automatic remote update check or new network service.

## 10. Security, privacy and licensing (P6-14)

- No telemetry, no network listener, no remote approval/execution.
- IPC token never logged; runtime descriptors are 0600 where the platform supports it; Windows ACL is
  best-effort and **not native-verified**.
- Firmware flashing is manual, approved and verified; no automatic flash on discovery.
- The frozen RC1 firmware and all Phase 5 evidence are preserved.
- New packaging/runtime dependencies: Node.js runtime (redistributed separately) and the existing
  SerialPort prebuilds. No new npm package was added in Checkpoint A. SBOM/licence notes are updated
  in `docs/dependencies.md`/`docs/licenses.md`; vulnerability status remains **NOT VERIFIED** while
  the advisory endpoint is unavailable.

## 11. Verification status

| Area | Status |
| --- | --- |
| Bridge/plugin/config/discovery/IPC unit tests on Linux | AUTOMATED PASS |
| Windows paths, descriptor, ACL command construction | AUTOMATED/MOCK, not native |
| Windows named pipe listen/connect, COM discovery, DACL | **NATIVE VERIFIED NOT DONE** |
| Linux socket compatibility and existing tests | AUTOMATED PASS |
| Plugin JSONC merge/backup/uninstall on fixtures | AUTOMATED PASS |
| Portable package build on Linux | AUTOMATED PASS (local demo) |
| Windows installer build/run | **NOT DONE** (requires native Windows) |
| Firmware manifest verification | AUTOMATED PASS; no flash |
| Hardware, cold boots, soak, endurance | Phase 6 Checkpoints B/C/D |

No platform is declared supported until its native installation and execution are tested.
