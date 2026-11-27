# Phase 4.1 — one-hour MOCK soak

Date: 2026-11-27. Verdict: **PASS** for the soak itself.

## 1. Setup

| Item | Value |
| --- | --- |
| Firmware | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` (installed, verified) |
| Bridge | `58bd386` (Phase 4.1 tree), `source: mock` |
| Driver | test artifact `soak-driver.ts` (not product code), 500 ms tick |
| Duration | 3600 s monitored (driver 3660 s, 7316 cycles) |
| Device | ESP32-C3 on `/dev/ttyACM0`, no other host process |

The Phase 4.1 `stress` adapter only produces two MCP servers, so a dedicated test driver fed the
same 4.1 `Bridge` with the richer scenario required by the acceptance brief: **12 MCP servers and 8
graphical details**, three sessions, every companion state (thinking, generating, working,
permission_required, user_input_required, retrying, compacting, success, error, interrupted, idle;
offline was exercised by the reboot/restart series), permission and question lifecycles, large
tokens (4 000 000 000+ per operand, total above uint32; every 50th cycle an operand above uint32 to
exercise the unknown path), long valid identifiers (40 B model, 24 B agent) and 599-byte state
frames. The driver is not part of the product and is not installed on the device.

## 2. Result (VERIFIED)

```
started            2026-11-27T10:25:51+0100
duration_actual_s  3600
completed          true
interrupted        false

tx_frames          5990
rx_frames          5982
acks               4193
ack_timeouts       0
handshake_retries  0
device_errors      0
resyncs            0
invalid_frames     0
open_failures      0
reconnects         0
states             3591
mcp frames         600

rss_first          83 386 368 B
rss_last           78 798 848 B
rss_min            76 840 960 B
rss_max            86 999 040 B
cpu_seconds_total  9.61
```

- No ACK expiration, no parser error, no resync, no USB reconnect, no open failure, no handshake
  replay.
- RSS ended **below** its start (78.8 MB vs 83.4 MB) with a maximum of 87.0 MB: no sustained growth.
  CPU 9.61 s over 3600 s (≈0.27 % of one core).
- 3591 state frames (one per second) and 600 MCP frames were sent; the device acknowledged them.
- Every state was observed in the log, including `permission_required`, `user_input_required`,
  `retrying`, `compacting`, `success`, `error` and `interrupted`; tokens reached
  4 000 000 000+/500 000 000+.

## 3. Not measurable on the release image

The release firmware does not expose ACK latency percentiles, framing-recovery counters, TX drops
or reset reasons (diagnostics are compiled out). The soak therefore records:

- **ACK latency distribution**: not sampled. Expirations are 0, so no ACK exceeded 10 s.
- **Framing recoveries**: not countable on the release; no invalid frame was observed by the bridge.
- **Device reset reason / watchdog**: no USB re-enumeration occurred (reconnects 0), which is
  incompatible with a watchdog reboot on this board; the release exposes no counter.
- **RX/TX saturation**: no write failure, no ACK timeout and 5990/5982 frames over one hour; the
  diagnostic build would be needed for the device-side queue counters.

These are documented limitations, not failures. A diagnostic campaign remains available for a later
phase; it requires a separate flash approval.

## 4. Fault injection vs stable operation

The 3600 s run is a **stable** run: no intentional disconnect, no malformed frame, no forced reset.
The software resets and bridge restarts are a separate series (10/10 each) and are not counted in
this result. The device was not power-cycled during the soak.

## 5. Final state

After the soak the driver stopped, the port was released and the 4.1 LIVE bridge was restarted:
hello → ACK 1/2 → `state status=thinking ... source=live`, OpenCode 2.4.1, MCP 8/12, real tokens.
The device is back in LIVE operation.

## 6. Reproduce

```sh
# in the 4.1 worktree, with the device attached and no other bridge:
SOAK_SECONDS=3660 npx tsx soak-driver.ts > soak.log 2>&1 &
python3 tools/qa/soak_monitor.py --log soak.log --pid "$(fuser /dev/ttyACM0 2>/dev/null | awk '{print $1}')" \
  --seconds 3600 --interval 60
```

The driver is a test artifact; the product code is the 4.1 Bridge and the final firmware.
