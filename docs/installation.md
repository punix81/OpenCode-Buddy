# Installation

Date: 2026-11-27. Phase 6 provides a portable installation path. Windows x64 ZIP creation and
user-scope install, reinstall, fixture upgrade and uninstall were exercised on native Windows 11.
See [Checkpoint B evidence](evidence/phase-6-checkpoint-b.md).

> The hardware acceptance (cold boots, USB reconnections, soak, endurance, six-screen and
> performance validation) remains deferred to Phase 6 Checkpoints B/C/D on a native physical
> Windows/Linux computer. The VMware/Ubuntu USB-redirection environment is not the reference.

## 1. Prerequisites

| Item | Requirement |
| --- | --- |
| Node.js | 22 or newer on the user computer (runtime, not a compiler) |
| OpenCode | v2; plugin verified with 2.4.1 on the earlier baseline and 2.4.2 on Windows |
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

## 4. Install (Windows x64)

The portable ZIP includes compiled bridge JavaScript, the Windows named-pipe host, SerialPort
prebuilds, the plugin and a PowerShell wrapper. Node.js is a runtime prerequisite. Building from
source also uses the Windows .NET Framework C# compiler. After verifying the ZIP SHA-256, extract it
and run the wrapper from Windows PowerShell.

```powershell
.\windows\install.ps1 -PluginProject C:\path\to\project
# review the preview, then run the same command with -Apply
& "$env:LOCALAPPDATA\opencode-buddy\bin\opencode-buddy.cmd"
```

User scope only (`%LOCALAPPDATA%\opencode-buddy`), no elevation, no visible console for startup, no
firmware flash. This is an unsigned portable ZIP with a wrapper. Follow the host's normal script
execution and SmartScreen policies. Use `-StartupOutput` with an isolated filename to inspect the
generated definition. `-AutoStart -Apply` writes into the real user Startup folder and changes
startup behavior at the next login.
On the verified OpenCode version, `opencode debug paths config` reports the
profile's `.config\opencode` directory by default. Buddy stores its own
settings separately in `%APPDATA%\opencode-buddy`.

## 5. Update and uninstall

- Update: stop the bridge and run the new archive's installer using the same prefix and project.
  Existing configuration, files outside the owned app, and plugin backups are preserved.
- Uninstall:
  ```sh
  node install.mjs --prefix ~/.local/share/opencode-buddy \
    --plugin-project /path/to/project --uninstall --apply
  ```
  On Windows use `-Uninstall -Apply` with the same prefix and project. The installer removes the
  manifest-owned app, Buddy launchers, the matching Buddy plugin entry and any unchanged startup
  definition it recorded. It retains the rest of the prefix, settings and backups.
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
- `scripts/qa.ps1 -Coverage` runs the compatible bridge/plugin/script/protocol/configuration gates on
  native Windows. Build the Windows pipe host before running a development LIVE bridge.
- `node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json --image <rc1.bin> --plan`
  verifies the frozen firmware and prints the plan; it never flashes.
- Windows pipe, ACL, archive and COM discovery evidence is in
  [Checkpoint B](evidence/phase-6-checkpoint-b.md). USB handshake, physical reconnection,
  cold boots, panel matrix and endurance remain hardware gates.
