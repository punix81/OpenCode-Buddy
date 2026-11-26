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

### Bridge running, display still OFFLINE (verified, fixed)

Symptom observed on the audit machine: the mock bridge owned `/dev/ttyACM0`, the process was alive, yet
the panel stayed OFFLINE for minutes and no `state` frame was ever sent (measured traffic: ~14 B/s out
instead of ~700 B/s when the link is ready).

Cause: the port was opened while the board was still booting after the reset that the open itself
triggers. The device's `hello` fell into that window, and the bridge had **no handshake timeout**:
`tick()` only checked `linkTimeoutMs` in the `ready` state, and a half-open CDC fd reports no `close`
event, so no reconnect was ever scheduled. The session stayed in `handshaking` until the process was
restarted. The same half-open fd also made `transport.close()` hang, so SIGTERM did not terminate the
process.

Fix (bridge):

- `HANDSHAKE_TIMEOUT_MS` (7 s, more than two `kHelloIntervalMs` periods): a session that never
  handshakes is released and reconnected instead of waiting forever.
- `CLOSE_TIMEOUT_MS` (2 s): `transport.close()` is bounded, so shutdown and reconnection always
  progress. The CLI adds a watchdog and exits regardless.

Evidence: replaying the mock after the fix reached `ready` in 3 ms, sent one `state` per second and
received 22 acks (avg 29 ms). SIGTERM terminated the process in 111 ms, where it previously survived
indefinitely.

Do not work around this by reopening the port in a loop: each open resets the board and re-arms the
same race.

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

## Phase 3 — plugin and IPC

### The device stays IDLE/OFFLINE while OpenCode is running

1. `npm run diagnose:opencode` — it checks the binary, the plugin entry, the socket, the token
   handshake and the USB device in one pass.
2. `ipc directory … mode 700` and `IPC handshake accepted` mean the bridge is up. A `WARN plugin not
   configured` means the plugin entry is missing from the OpenCode configuration; nothing else can
   work until it is added (see `docs/plugin-installation.md`).
3. The bridge log must show `opencode peer=N app=cli version=2.4.1`. Without that line the plugin
   never connected: check the plugin path is a **directory**, not a file — OpenCode skips file paths
   with `configured plugin path must be a directory`.

### The panel shows another project's tokens

Symptom seen during development: 31.9 M input tokens at connect. Cause: the OpenCode server serves
every location, so both `ctx.event.subscribe()` and `ctx.session.list()` return other projects.
The plugin filters events on `location.directory` and restores only sessions of its own location
updated in the last 15 minutes. If it reappears, capture `OPENCODE_BUDDY_DEBUG=1` output in
`/tmp/opencode-buddy-debug.log` and check the `snapshot directory=` line.

### Nothing happens on the panel for a tool that lasted milliseconds

The bridge emits state once per second. A tool that starts and succeeds inside that window is counted
(verified: `tools=3/0/1` for a real `ls`) but may never be sampled as WORKING. Use a tool that runs
longer to observe the state.

### Plugin debug output

`OPENCODE_BUDDY_DEBUG=1` writes to `/tmp/opencode-buddy-debug.log` (the OpenCode server detaches its
stderr, so console output is lost). Never enable it in normal use: it records event types and
session identifiers, never prompts or content.

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
- `npm run diagnose:opencode` checks the global file and every project `opencode.json`/`opencode.jsonc`
  up to the repository root; `plugin configured (project)` is a valid result.
- Config additions reload without restart on OpenCode 2.4.1 (verified for a project-local
  `opencode.json`, see `docs/plugin-installation.md` §3.1); a stuck server is restarted with
  `opencode service restart`, which ends any running agent session.
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

## Phase 3.1 (audit remediation)

### `another bridge is running (pid N)`

A second bridge is refused before it touches the token or socket. Stop the first one, or point the new
one at a different runtime directory with `OPENCODE_BUDDY_RUNTIME_DIR`. A crashed bridge leaves
`bridge.lock`; a dead PID is detected and the lock is removed automatically.

### `refusing to replace a non-socket path`

Something replaced `bridge.sock` with a regular file or a symlink. The bridge refuses to unlink it.
Inspect the runtime directory and remove the unexpected file manually before restarting.

### `opencode peer=N source=degraded`

The plugin is alive but its event subscription ended. The bridge closes that peer's sessions, keeps any
terminal notification for its TTL, and the plugin resubscribes with 1 s → 15 s backoff. If it never
recovers, restart OpenCode; the plugin never blocks the server.

### `ack timeout seq=N`

A state or MCP frame was not acknowledged within 10 s. It is forgotten and counted in
`stats.expiredAcks`; the next periodic snapshot replaces it. Repeated timeouts mean a saturated or
half-open USB link.

### Preferences keep resetting (quiet mode, language)

With the pre-Phase-3.1 firmware, the bridge sends the legacy `language`/`quietMode` fields because the
device does not advertise `config.partial`. Flash the Phase 3.1 firmware (with approval) to let the
device own those preferences.

### Device re-enumerates on a different `ttyACM`

The bridge re-runs Espressif USB discovery before each reconnection and opens the new port; it no longer
reopens the stale path. If no Espressif device is found, the normal absence backoff applies.

### Diagnosing dropped plugin frames

With `OPENCODE_BUDDY_DEBUG=1`, the plugin writes a private `plugin-debug.log` in the runtime directory
(0600, 1 MiB cap). The summary line reports `dropped queue=… oversized=… backpressure=…`. Dropped state
frames are replaced by the next snapshot; dropped terminal events are not replayed by design.

### Token and tool counters look session-scoped

This is intentional since Phase 3.1: the Buddy shows the focus session's tokens and tools, matching the
model, agent and chronometer on screen. A session switch changes all of them together.


## Phase 3.1 hardware validation notes

### One `E_PARSE` + resync after a USB power-cycle

After unplugging and replugging the USB cable, the device power-cycles and may report one
`E_PARSE` while it is still booting; the bridge re-sends `config`, the device acknowledges, and the
LIVE view returns in about 2 seconds. No error occurs afterwards. Bridge restarts with the device
already running are clean (0 error, 0 resync). See
`docs/evidence/phase-3-1-hardware-validation.md` §9.

### No snapshot until the handshake is acknowledged

Since `be2b803` the bridge withholds `state` and `mcp_status` until the device acknowledges
`ready`/`config`. A short OFFLINE period after a connection is normal; if it never clears, check the
device ACKs in the bridge debug log (`ack received`).

### The MOCK stress scenario shows Permission

The stress cycle deliberately enters `permission_required` and `user_input_required`; it now resolves
them on the same session within the cycle. A permanently stuck Permission during a MOCK run is the
old adapter defect (fixed in `4ffb144`).

### Diagnostic `BUDDY-DIAG` lines interleave with NDJSON

The diagnostic build (`supermini-diag`) still emits hello/heartbeat frames while printing its
diagnostics; this is a bench-only image, never the release. Parse from the `BUDDY-DIAG` marker when
collecting measurements.
