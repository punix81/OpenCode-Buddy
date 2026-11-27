# Phase 5 — USB diagnostic campaign (2026-11-27)

Status: **BLOCKER NOT RESOLVED.** The device's USB CDC RX path can stop delivering host bytes after a
watchdog/flash reset; the bridge then sends `ready`/`config` but receives no ACK. A real power cycle
restores the link. The pre-link TX backlog is a contributing factor, not the proven sole cause. No
release change from this campaign is validated; RC1 `dd7d1d57…` remains the stable software candidate.

## 1. Environment and preparation

| Item | Value |
| --- | --- |
| Device | ESP32-C3, MAC `44:BD:8D:4E:27:A4`, `/dev/ttyACM0` |
| Installed 4.1 | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`, 411 232 B |
| Full backup (fresh) | `25c1d7ffd28d28031b976e27daa57882ec7f26924bafd9e5b0f2f8af970fada9`, 4 194 304 B |
| Bridge 4.1 | `/tmp/opencode/buddy41`, commit `58bd386` |
| Bridge main | `c4db0b3` + `BUDDY-DIAG` filter, 126/126 tests |
| esptool | 5.7.0, `--no-stub`, application-only at `0x10000` |

All images and the full backup are outside the build trees (`.backups/`). Rollback uses only
`2ff67b71…`, never the Phase 4 image `741dcb5b…`.

## 2. Baseline on the installed 4.1 (before any Phase 5 flash)

| No-host window | Result | Detail |
| --- | --- | --- |
| 60 s | **PASS** | ready 6.12 s, ACK 1/2 7.20 s, 0 retry, 0 invalid, 0 reconnect |
| 300 s | **PASS** | ready 5.28 s, ACK 1/2 6.42 s, 0 retry, 0 invalid, 0 reconnect |
| 900 s | **PASS** | ready 4.26 s, ACK 1/2 5.36 s, 0 retry, 0 invalid, 0 reconnect |

The historical 07:56 failure was not reproduced by these three openings. Logs:
`/tmp/opencode/p5/diag-baseline/start-{60,300,900}s.log` (transient, summarised here).

## 3. Authorised diagnostic image `3646d4ce…`

Flash verified: write 415 408 B, independent read-back `3646d4ce…`, `verify-flash` matched. First
opening after 60 s **failed**:

- Bridge: `ready` at 3.1 s, no ACK, handshake retry 1/2/3, reopen; two sessions failed.
- Device: `rx_bytes=16`, `rx_lines=0`, `ok=0`, `last=255`, `hello=24`, `hb=24`, `dropped=26`.
- Host RX: two `E_PARSE` at the open (boot backlog/self-echo).

The diagnostic image used direct `Serial.printf`, which can block the main loop and starve RX; the
26 dropped protocol frames show a large pre-link TX backlog. This run therefore mixes the residual
defect with an instrumentation defect.

## 4. Release 4.1 after rollback: blocker is real

Rollback to `2ff67b71…` verified. The 4.1 bridge then failed the first two sessions after the reset
(ready, no ACK, 3 retries, reconnect), with no diagnostic instrumentation. After the host stayed away
for a few minutes, a new opening was **PASS** (ready 4.5 s, ACK 1/2, 0 retry). A genuine power cycle
(USB disconnect at 14:25:20Z, re-enumeration device **22** at 14:25:24Z) also restored the link.
The failure is transient and tied to the USB state around reset/port open, not to the renderer or
the protocol logic.

## 5. Instrumentation defects found and fixed (not release behaviour)

1. Direct `Serial.printf` for `BUDDY-DIAG` could interleave with a partially flushed NDJSON frame.
   Fix: dedicated 1 KiB diagnostic `TxBuffer` (`11296e9`).
2. The first diagnostic buffer only flushed when `free >= pending`; the CDC offers ~256 B while two
   lines are ~700 B, so **no telemetry was emitted** (`af390f71` run). Fix: chunked flush with the
   diagnostic line kept contiguous (`fix3`).
3. `hostConnected()` is true after USB **enumeration**, not when a process opens the port. The
   pre-link fix therefore still sent 26 hellos without a bridge. Fix attempt: gate the hello on the
   first host byte (`fix4`).

## 6. Corrected diagnostic results

| Image | Hash / size | Result |
| --- | --- | --- |
| `af390f71` (pre-link + diag TxBuffer) | `af390f71…`, 416 704 B | no telemetry (flush bug); 0 ACK, 3 retries |
| `fix3` `3689b828` | `3689b828…`, 416 704 B | `hello=26`, `hb=0`, `rx_bytes=16`, `rx_lines=0`, `ok=0`; no ACK, 3 retries |
| `fix4` `0b57ca8c` | `0b57ca8c…`, 416 624 B | `hello=0`, `hb=0`, **`rx_bytes=0`**; bridge: “no hello received”, timeout |

`fix3` proves the heartbeat suppression works but the hello backlog (enumeration-based
`hostConnected`) persists. `fix4` proves the host-byte gate removes the backlog but **deadlocks**
when the RX path is dead: the device never sees the bridge's prime, never announces itself, and the
bridge times out. The RX path delivered **zero** host bytes in that run.

## 7. Root-cause status

**Confirmed facts:** after a watchdog/flash reset the device can deliver 0 or 16 host bytes and no
complete line; its own TX (hello/diagnostic) still works; the host's `ready`/`config` writes are
accepted by the OS; a real power cycle restores the handshake; the 4.1 baseline openings pass when
the RX is alive. **Not proven:** whether the stall is in the ESP32-C3 USB Serial/JTAG RX endpoint,
the Arduino `HWCDC` ring, or the host's CDC driver state after reset. No root cause is claimed.

The pre-link TX backlog (26 hellos / 26 dropped frames) is an aggravating factor: it competes with
RX service. It is not the sole cause, since the release 4.1 failed without diagnostics and `fix4`
failed with no pre-link traffic at all.

## 8. State after the campaign

- Installed image: `2ff67b71…` (verified read-back), bridge stopped.
- A **physical power cycle/replug** is required to restore the LIVE bridge after a watchdog reset.
- No final RC was flashed. RC1 `dd7d1d57…` remains the stable software candidate. The host-byte
  gate was **reverted** (`d564f48`); the release source reproduces RC1 code (fresh build
  `f9cc72ee…`, code/data-identical to `dd7d1d57…`). The experimental `c3468a99…` is historical
  evidence only.
- 20 cold boots, 10 USB reconnections, the RC soak and the 8 h endurance remain open.

## 9. Recommended next steps

1. Power-cycle the device and confirm the 4.1 bridge handshake (cold-boot evidence).
2. Investigate the USB CDC RX reset explicitly: re-initialise the USB peripheral on the host edge,
   or have the bridge toggle DTR/RTS, or require a power cycle after flashing. This needs a new
   approved diagnostic image and a repeat of the 60 s/5 min/15 min series.
3. Do not ship a hello gate that depends on host input while RX may be dead.
4. Only after the RX recovery is proven, rebuild and flash the final RC and run the cold-boot,
   reconnect, soak and endurance gates.
