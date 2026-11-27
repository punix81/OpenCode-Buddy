# Windows installation (prepared, not native-validated)

Date: 2026-11-27. This directory is prepared for a **native physical Windows 10/11** host.
It has **not** been built, installed or executed in the Ubuntu VM; a Linux mock is not a Windows
validation. No administrator rights and no firmware flash are involved.

## Build (on Windows, with Node.js 22+ and npm)

```powershell
cd <repo>
powershell -ExecutionPolicy Bypass -File installer\windows\build.ps1
```

This runs `scripts/package-portable.mjs --platform win32 --no-archive`, then writes a `.zip` and its
SHA-256 under `release\`. The app tree contains compiled JavaScript, runtime-only `node_modules` and
SerialPort prebuilds; the user does not compile TypeScript.

## Install (user scope)

Extract the archive, open PowerShell in the extracted directory, and preview:

```powershell
powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1 -PluginProject C:\path\to\project
# dry-run; then:
powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1 -PluginProject C:\path\to\project -Apply
```

- Default prefix: `%LOCALAPPDATA%\opencode-buddy`.
- `-PluginGlobal` is explicit; the real global OpenCode configuration is never modified by
  development tests.
- `-AutoStart` writes a hidden per-user Startup `.vbs`; it does not create a service or require
  elevation.
- `-Uninstall` removes only the app prefix, launcher and the Buddy plugin entry. OpenCode, other
  plugins, MCP servers and configuration are preserved.

## Native validation required (Checkpoint B)

1. Build and install on native Windows 10/11 (no VMware).
2. Verify the named pipe, token/descriptor and ACL behaviour with a real second local user if
   possible.
3. Verify COM discovery with the real ESP32-C3 and the explicit multi-device workflow.
4. Verify plugin install into a real JSON/JSONC OpenCode configuration, with a backup.
5. Verify startup after login, single instance and clean shutdown.
6. Record unsigned-installer/SmartScreen warnings; do not bypass Defender or SmartScreen.

## Firmware

No firmware is included or flashed. Use `firmware/rc1-manifest.json` and the approved
application-only procedure in `docs/firmware-management.md`. A blank device requires a separate
initial full installation.
