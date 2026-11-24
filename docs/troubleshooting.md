# Troubleshooting

Only issues observed or verified during this project's own audits are listed with a confirmed cause.
Anything else is marked as a hypothesis to validate in the phase that touches it.

## Serial port

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
- Linux: `lsusb`, `dmesg | tail` after plugging.
- Windows: Device Manager → Ports. A missing CDC driver shows as an unknown device.
- `arduino-cli` discovery is not installed on the audit machine; use the OS tools instead.

### Upload enters download mode unexpectedly

- Hypothesis (Phase 1): GPIO0 is the display reset and a strapping pin. Confirm on the real unit before
  changing wiring. Mitigation is a reset-line timing change, not rewiring.

## Firmware build

### `pio: command not found`

Verified: PlatformIO Core is not installed on the audit machine, even though
`~/.platformio/platforms/espressif32` (6.5.0) and the toolchains are cached. Installing it requires
network access and approval. `arduino-cli` is not a substitute: it has no index for this platform and
cannot reach its download host on the audited network.

### Library resolution fails offline

The reference project already contains resolved libraries (LovyanGFX 1.2.21, ArduinoJson 7.4.3) under
its own `.pio/libdeps`. Build offline only after those dependencies are available to the Buddy project;
never copy them silently from another checkout without recording versions.

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
