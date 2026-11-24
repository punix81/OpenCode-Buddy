# Troubleshooting

Only issues observed or verified during this project's own audits are listed with a confirmed cause.
Anything else is marked as a hypothesis to validate in the phase that touches it.

## Serial port

### Opening the CDC port resets the board (verified)

On this ESP32-C3 Super Mini setup, **opening `/dev/ttyACM0` resets the MCU**. Each open increments
the boot counter (`boot=6`, `boot=7`, …), resets the gesture counters and re-renders the persisted
last screen. This is not a firmware bug; it is how the board behaves with the host CDC driver.

Consequences for testing:

- Never interpret `touch_edges=0` or `screen=0` from a freshly opened port as "no gesture": the
  counters were just cleared by the reset.
- Keep **one** serial connection open for the whole observation window and do not close/reopen it
  between actions.
- Automatic watchers that reconnect after every read will reset the board each time and invalidate
  gesture and persistence measurements.
- The reset is also useful: it proves NVS persistence, because the board returns to the last saved
  screen after the reset.

### `could not open port` / permission denied

- Cause: another process owns the device, or the user lacks group access.
- Verified on the audit machine: a pre-existing bridge process held the port, so a second opener fails.
- Check owners: `fuser -v /dev/ttyACM0` (Linux) or `Get-Process` + port tools (Windows).
- Linux permissions: the user must be in `dialout` (or the distribution's serial group); re-login after
  adding the group.
- Do not permanently disable the other bridge. Stop it for the test, restart it afterwards.

### Device not listed

- Expect an Espressif USB JTAG/serial debug unit (vendor `303a`). If it is absent, the cable may be
  power-only or the board may be in a bad state.
- Linux: `lsusb`, `journalctl -k` after plugging (look for `cdc_acm ... ttyACM`).
- Windows: Device Manager → Ports. A missing CDC driver shows as an unknown device.
- **Virtual machine (verified):** after a USB disconnect, VMware may keep the device on the host. Use
  VM → Removable Devices → *Espressif USB JTAG/serial debug unit* → **Connect (Disconnect from Host)**.
  Re-plugging alone may produce no kernel event inside the guest.
- The port number can change (`ttyACM0` → `ttyACM1`) after a re-enumeration. Identify it by udev
  vendor/model and serial, never by assuming `ttyACM0`.

### Upload enters download mode unexpectedly

- Hypothesis (Phase 1): GPIO0 is the display reset and a strapping pin. Confirm on the real unit before
  changing wiring. Mitigation is a reset-line timing change, not rewiring.

## Firmware build

### `pio: command not found`

Verified: PlatformIO Core is installed **project-locally** in the repository-root `.venv`, not on
`PATH`. Run `.venv/bin/pio` from the repository, or activate the environment. `arduino-cli` is not a
substitute: it has no index for this platform on the audited network.

### Library resolution fails offline

Verified: `pio run` reached the PlatformIO registry and failed with `HTTPClientError`, then stalled.
Two separate causes must be handled:

1. **TLS interception.** `uv` reports `invalid peer certificate: UnknownIssuer`. Install with
   `uv pip install --system-certs ...` and, if needed, point Python at the system bundle with
   `REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt`. Never disable verification.
2. **Registry reachability.** If the registry still does not respond, use the git-ignored
   `firmware/platformio.local.ini`, which links the already-cached LovyanGFX 1.2.21 through
   `symlink://../../Codex-Quota-Mini/.pio/libdeps/supermini/LovyanGFX`. The committed
   `firmware/platformio.ini` stays registry-based and is the distributed definition.

Record the library version used; never copy a library silently without pinning it.

## Backup and flashing

### `read_flash` aborts with “device reports readiness to read but returned no data”

Verified: with the esptool **stub** (`esptool.py read_flash`), the ESP32-C3 USB CDC re-enumerated and
the tool lost the port. The stub itself is the trigger, not the baud rate: it failed before any baud
change. Use the ROM loader:

```sh
esptool.py --port /dev/ttyACM0 --no-stub --after no_reset read_flash 0x0 0x10000 head.bin
```

`--no-stub` read 64 KB in 1.6 s with a valid image magic (`e9`). It also avoids re-enumeration, so the
device stays reachable between commands.

### A full 4 MB read ends with “CRC or checksum was invalid”

Verified: one 4 MB ROM read failed mid-transfer with a CRC error on this USB path. Read in 64 KB
blocks and retry each block; esptool validates every block, so a concatenation of successful blocks is
trustworthy. The local helper used during Phase 1 validation is
`.backups/phase1-2026-11-24/read-chunked.sh` (not committed).

### Before flashing: prove the backup

1. `sha256sum full-flash.bin` and record it.
2. Extract and compare the bootloader (`0x0`, 13 200 B), partition table (`0x8000`, 3 072 B) and app
   (`0x10000`, 860 304 B for the reference build) against the reference build artefacts.
3. Only if all three match, the dump is a faithful copy of the running firmware.

### Restore

Restore the **whole** dump, not only the app, so NVS and otadata return to their prior state:

```sh
esptool.py --port /dev/ttyACM0 --no-stub --after no_reset write_flash 0x0 full-flash.bin
esptool.py --port /dev/ttyACM0 --no-stub --after hard_reset verify_flash 0x0 full-flash.bin
```

Then restart the reference bridge (`systemctl --user start codex-quota-bridge.service`, or the manual
command documented in the phase report) and confirm the reference screen.

### The board stays silent after a flash

Verified on this board: `--after hard-reset` toggles RTS, and RTS is **not** wired to EN on the native
USB path. The chip can therefore stay in the ROM bootloader after a flash, enumerating normally while
the application never runs. Nothing is printed and the bridge waits in `handshaking` forever.

Use a watchdog reset instead, which restarts the application deterministically:

```sh
esptool --chip esp32c3 --port /dev/ttyACM0 --no-stub --after watchdog-reset flash-id
```

The device re-enumerates (the USB device number changes) and `npm run diagnose` then receives `hello`.
If it does not, unplug and replug USB once: that is the only way to be sure the chip left download
mode.

## OpenCode integration

### Plugin does not load

- Verify the OpenCode version matches the supported plugin API minor (`opencode --version`).
- Check the log: `~/.local/share/opencode/log/opencode.log`, filter `role=server`.
- Config changes reload without restart; a stuck server is restarted with `opencode service restart`.
- A plugin under `.opencode/plugins/` loads automatically for that project; a package must be listed in
  `plugins`.

### No events arrive

- The plugin runs inside the server; a session started with `--standalone` uses a private server with
  its own plugin instances.
- Confirm a session is actually executing, not idle.
- Remember `server.connected` is not delivered to plugins.

### HTTP experiments return `UnauthorizedError`

Verified: the local HTTP API requires the server's bearer authentication. Tokenless `curl` against
`/api/event` fails. Use the plugin path, or the `opencode api` command which handles authentication.

### `opencode mcp list` shows servers as `pending`

Observed: the CLI listing starts/refreshes servers, so an initial listing can show `pending` while the
running server's `/api/mcp` reports `connected`. Trust the server-reported status for the MCP Radar,
not a one-shot CLI listing.

## Bridge

### `npm run diagnose` reports `no Espressif USB device found`

- Enumerate manually: `lsusb | grep 303a` (Linux) or check Device Manager (Windows). The bridge only
  auto-selects Espressif `303a:1001` and refuses to write to anything else.
- Pass the port explicitly: `npm run diagnose -- --port /dev/ttyACM0`.
- On Linux, confirm the user is in the `dialout` group; a permission error is reported distinctly.
- `no serial port configured` means `port` is `null` and `autoDetect` is disabled in the config.

### The device resets every time the bridge starts

Expected: opening the USB CDC port reboots the ESP32-C3. The bridge therefore opens the port once and
keeps it open. A reset loop means the port is being reopened — another process is likely competing for
it (`fuser -v /dev/ttyACM0`).

### The bridge stays in `handshaking`

- The device sends `hello` first; the bridge never writes before receiving it. If nothing arrives, the
  firmware may be the Phase 1 image (no protocol) — check `versions` on the screen or re-flash.
- If the board was just flashed with `--after hard-reset`, it may still be in the ROM bootloader: use
  `--after watchdog-reset` (see “Backup and flashing”).
- A protocol major mismatch ends in `error` with an explicit message, not a silent timeout.

### The device goes silent and the port re-enumerates

Observed during a Phase 2 soak: the firmware wrote NDJSON to a CDC port that no host was reading, the
TX buffer filled, `Serial.write` blocked the main loop, and the task watchdog rebooted the chip. The
fix is in the firmware: every frame is checked against `Serial.availableForWrite()` and dropped (and
counted) rather than blocked. If the symptom returns, capture the reset reason with a diagnostic build.

### `E_PARSE` and `resync` at every connection

Observed on one unit right after the handshake: the core's 256-byte USB CDC RX queue overflows while a
full-screen render blocks the loop for tens of milliseconds, so bytes are lost mid-frame. The firmware
now calls `Serial.setRxBufferSize(1024)` first in `setup()`; the reference firmware uses the same
value. A larger value (4096) was tried and left that unit unable to receive anything at all, so do not
raise it without re-testing the link. If this reappears, check that call before suspecting the
protocol. The `resync` path recovers on its own, so the symptom is a lost snapshot, not a dead link.

### The bridge reports `degraded` then `offline`

- `degraded` means no valid message within `linkTimeoutMs` (default 6 s). Heartbeats are sent every 2 s;
  a `degraded` link usually means the device stopped answering (reset, crash, cable).
- After a reconnect the bridge sends a full state snapshot, so no data is lost from the display's
  point of view; only the elapsed counters restart.

### The screen shows `MOCK`

Correct behaviour for `npm run mock` and `npm run simulate`: every simulated state carries
`source: "mock"` and must be visibly labelled. Live data uses `source: "live"`.

### Serial output looks like garbage or the parser reports `E_PARSE` everywhere

Free-form diagnostics must be off. The release build compiles out `BUDDY_DIAGNOSTICS` and
`BUDDY_BENCH_COMMANDS`; a diagnostic build must not be connected to the bridge at the same time.

## Device behaviour

### Screen is blank but backlight is on

- Hypothesis: SPI wiring or `invert`/`rgb_order` mismatch. The reference values are fixed in
  `docs/hardware-audit.md`; do not tune them by trial and error without a measurement.

### Touch triggers twice

- The reference uses a 35 ms debounce and edge detection. If double actions reappear, check the gesture
  state machine's exclusivity (very long press must suppress long press), not the electrical side.

### Companion shows `OFFLINE` while OpenCode is busy

- Expected when the plugin or bridge is absent: the connection state is independent from execution
  state. Check the System screen's `BRIDGE` and `OPENCODE` rows.

## Diagnostics

Planned (`buddy doctor`, Phase 2): prints OpenCode version and connection, plugin presence, bridge
version, protocol version, candidate ports, device handshake, and the last sanitized error code. It must
never print configuration values, environment variables or payloads.
