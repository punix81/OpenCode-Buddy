# Installation

> **Status: not installable yet.** No firmware, bridge or plugin exists. This page records the
> verified prerequisites and the intended installation path so that Phase 6 can implement it without
> rediscovering constraints.

## 1. Current prerequisites (verified during Phase 0)

| Requirement | Verified state on the audit machine | Needed for |
| --- | --- | --- |
| OpenCode **v2** (`opencode --version` → 2.4.1) | present | Phases 3+ |
| Node.js ≥ 20 (audited with 24.x) | present | Phases 2+ |
| PlatformIO Core (`pio`) | **not installed**; platform 6.5.0 and toolchains cached | Phase 1 |
| `arduino-cli` | 1.5.1, no indexes, cannot reach the download host | not used |
| ESP32-C3 Super Mini on USB CDC | device enumerated as an Espressif USB JTAG/serial unit | Phases 1+ |
| Exclusive access to the serial port | may be held by another bridge process | Phases 1+ |

## 2. Expected installation shape (Phase 6)

1. **Flash the firmware** (once per device, requires approval):
   - `pio run -e buddy` then `pio run -e buddy -t upload --upload-port <PORT>`;
   - verify the display boots into OFFLINE;
   - record the restore command for the previous firmware.
2. **Install the bridge** as a user-level service:
   - Linux: systemd user unit, restart on failure, port conflict check at start;
   - Windows: per-user startup entry or service wrapper; no admin rights required;
   - configuration in `config.local.json`, never in the repository.
3. **Enable the plugin** in OpenCode:
   - add the plugin entry to the project or global configuration with the exact snippet printed by the
     installer;
   - the installer must show the diff and ask before writing.
4. **Verify**: `buddy doctor` (planned) reports OpenCode, bridge, protocol and device status.

## 3. What will never be automated

- Approving permissions on the user's behalf.
- Modifying enterprise proxy or TLS settings.
- Enabling telemetry or any remote endpoint.
- Flashing without an explicit, interactive confirmation.

## 4. Uninstall

Planned: stop and remove the service, remove the plugin entry (showing the diff), optionally restore the
reference firmware, delete configuration and logs. No data is left outside the user's config and log
directories.

## 5. Verification during Phase 0

This audit deliberately installed nothing and changed no existing configuration. The commands used for
inspection are listed in `docs/phase-0-report.md` §5.
