# Installation

Date: 2026-11-27. Phase 6 Checkpoint A provides a portable installation path. Linux has been built
and demonstrated locally from an isolated fixture; Windows scripts are prepared but **not
native-validated**. No firmware is flashed by any installer.

> The hardware acceptance (cold boots, USB reconnections, soak, endurance, six-screen and
> performance validation) remains deferred to Phase 6 Checkpoints B/C/D on a native physical
> Windows/Linux computer. The VMware/Ubuntu USB-redirection environment is not the reference.

## 1. Prerequisites

| Item | Requirement |
| --- | --- |
| Node.js | 22 or newer on the user computer (runtime, not a compiler) |
| OpenCode | v2, verified 2.4.1; the plugin stays dependency-free |
| Device | ESP32-C3 with a compatible OpenCode Buddy firmware and the documented wiring |
| OS | Native Linux (Ubuntu/Debian first) or native Windows 10/11; no VMware USB passthrough |
| Firmware | RC1 `dd7d1d57…` is an application-only image; a blank device needs a separately approved initial full installation |

No administrator/root rights are required for a user-scoped install. No telemetry or network
service is installed.

## 2. Build a portable package (build machine)

```sh
# Linux build host
node scripts/package-portable.mjs --out release
# -> release/opencode-buddy-<version>-linux-<arch>/ and .tar.gz + .sha256

# Windows build host (native, not the Ubuntu VM)
powershell -ExecutionPolicy Bypass -File installer/windows/build.ps1
```

The tree contains the compiled bridge (`tsc`), runtime-only `node_modules` (SerialPort prebuilds),
the plugin, the installer and the firmware manifest. The user does not compile TypeScript and does
not run `npm install`. Node.js itself is not bundled yet; this is a deliberate Checkpoint A choice.

## 3. Install (Linux, user scope)

```sh
tar -xzf opencode-buddy-<version>-linux-<arch>.tar.gz
cd opencode-buddy-<version>-linux-<arch>

# Preview only (default): no file is written
node install.mjs --prefix ~/.local/share/opencode-buddy \
  --plugin-project /path/to/project

# Install the app and add the plugin to that project's opencode.json/jsonc
node install.mjs --prefix ~/.local/share/opencode-buddy \
  --plugin-project /path/to/project --apply

# Start manually
~/.local/share/opencode-buddy/bin/opencode-buddy
```

- Default prefix: `~/.local/share/opencode-buddy`; launcher `~/.local/bin/opencode-buddy` is not
  created automatically by the portable installer; use the prefix launcher or add it to `PATH`.
- The plugin installer is dry-run by default, preserves JSONC comments/providers/MCP/skills/other
  plugins, writes a timestamped backup before `--apply`, and is idempotent.
- `--plugin-global` is explicit and must be used deliberately; it is never used by development tests.
- `--autostart-output FILE` generates an optional user startup definition; it does not enable a
  service. The generated supervisor retries with bounded backoff (5 s → 30 s).
- Configuration is read from `BUDDY_CONFIG`, an existing `config.local.json` (development), or
  `$XDG_CONFIG_HOME/opencode-buddy/config.json` / `~/.config/opencode-buddy/config.json`. See
  [configuration](configuration.md).

## 4. Install (Windows, prepared)

The archive includes `windows/install.ps1` and a README. On a native Windows host:

```powershell
powershell -ExecutionPolicy Bypass -File windows\install.ps1 -PluginProject C:\path\to\project
# preview; then add -Apply
```

User scope only (`%LOCALAPPDATA%\opencode-buddy`), no elevation, no visible console for startup, no
firmware flash. The installer is unsigned; SmartScreen warnings must be documented, never bypassed.
Native validation is a Checkpoint B requirement.

## 5. Update and uninstall

- Update: replace the app tree/prefix with the new portable archive; preserve configuration and the
  plugin entry. Offline updates are the priority.
- Uninstall:
  ```sh
  node install.mjs --prefix ~/.local/share/opencode-buddy \
    --plugin-project /path/to/project --uninstall --apply
  ```
  This removes only the app prefix, launcher and Buddy plugin entry. OpenCode, unrelated plugins,
  MCP servers, user settings and firmware are untouched. Configuration and backups are preserved.
- Firmware is never erased by an uninstall; rollback follows
  [firmware management](firmware-management.md).

## 6. Development installation

```sh
cd bridge
npm ci
npm run live          # LIVE, default
npm run mock -- --scenario all-states   # MOCK
npm run diagnose      # device/link diagnostic
node ../scripts/install-buddy-plugin.mjs --project <dir>   # dry-run
```

## 7. Verification and limitations

- `scripts/qa.sh --coverage` runs the bridge/plugin/script/firmware host/preview gates.
- `node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json --image <rc1.bin> --plan`
  verifies the frozen firmware and prints the plan; it never flashes.
- Windows Named Pipes, real COM discovery, Windows ACLs, native installers, real USB reconnections,
  cold boots, soak/endurance and the six-screen matrix are **not yet native-verified**. They are
  Checkpoint B/C/D gates.
