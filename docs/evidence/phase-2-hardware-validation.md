# Phase 2 hardware validation

Date: 2026-11-24
Scope: real ESP32-C3 boards, USB CDC link, the ratified NDJSON v1 protocol, the bridge and the
firmware display stack.
Result: **link verified; one-hour soak and heap/FPS measurement still open.**

## 1. Units used

Three ESP32-C3 Super Mini boards were involved. MAC addresses are recorded locally for
identification and deliberately not committed.

| Unit | Role | Chip | Flash | Outcome |
| --- | --- | --- | --- | --- |
| A | original validation unit | ESP32-C3, rev v0.4 | 4 MB | Phase 2 image flashed; protocol defects D-11…D-15 found; long run reset the board |
| B | replacement | ESP32-C3, rev v0.4 | 4 MB (XMC) | full image flashed; handshake corruption found (D-18); scenarios passed |
| C | current unit (spare) | ESP32-C3, rev v0.4 | 4 MB (XMC) | full image flashed; `setRxBufferSize(4096)` killed RX, 1024 works; rotation applied |

Units B and C arrived with unknown flash contents, so each received the **complete image**:
bootloader (`0x0`), partition table (`0x8000`), `boot_app0` (`0xe000`) and application (`0x10000`),
each verified region by region with esptool.

## 2. Image

| Metric | Value |
| --- | --- |
| Flash | 372 250 B (28.4 %) |
| Static RAM | 20 420 B (6.2 %) |
| Image size | 406 576 B |
| Image SHA-256 | `76e854213f22a16332b65a43d6e5b63f2a63de9515950c3b39037be61c0f470c` |
| Rotation | 1 (90°), for the printed enclosure |

## 3. Defects found on hardware, and their resolution

| ID | Symptom | Cause | Fix | Verified |
| --- | --- | --- | --- | --- |
| D-11 | Bridge stayed in `handshaking` forever when started after the device booted | Opening the USB port does not reset the board, and `hello` was only sent at boot | Device re-announces every 3 s while no session exists; `resetSession()` restarts its sequence | yes |
| D-14 | Bridge entered `error` immediately after opening the port | `set({dtr,rts})` is rejected by this CDC port and emits a port error, read as fatal | No modem-control access; a port error is a link loss with backoff | yes |
| D-13 | Four full snapshots in a few milliseconds at open | Buffered `hello` frames replayed as a burst | Bridge ignores a repeated `hello` with the same `boot` within 2 s | yes |
| D-15 | Board reset after ~11 min and stayed mute; the bridge then looped on reconnects | NDJSON written to a CDC port with no reader filled the TX buffer, `Serial.write` blocked the loop, the watchdog rebooted the chip | `sendEncoded` checks `availableForWrite()` and drops (counted) instead of blocking | fixed; long soak pending |
| D-17 | Board mute even after a watchdog reset | The `bool(Serial)` announcement gate stayed true after esptool asserted DTR, so the firmware believed a reader was attached | Gate removed; announcement no longer depends on host-attachment state | yes |
| D-18 | `E_PARSE` + two `resync` at every handshake on unit B | Core default 256-byte CDC RX queue overflowed during a full-screen render | `Serial.setRxBufferSize(1024)` in `setup()` | yes on C; 4096 left C unable to receive (cause NOT VERIFIED) |
| D-19 | One lost frame per connection (~30 ms after handshake) | Handshake burst ≈ 1.1 KB exceeds the 1024-byte RX queue while rendering | Bridge sends `ready`+`config`+`ack`, then `state`+`mcp_status` on the next tick | yes |

D-16 is operational, not a code defect: `--after hard-reset` toggles RTS, which is not wired to EN
on these boards, so the chip can stay in the ROM bootloader after a flash. `--after watchdog-reset`
starts the application reliably and re-enumerates the USB device.

## 4. Protocol behaviour observed

- Handshake: `hello` (seq 1) → `ready` (1) → `config` (2) → `state` (3) → `mcp_status` (4) → device
  `ack` for each applied message.
- Sequence handling: duplicates re-acknowledged, gaps recovered by `resync` + full snapshot.
- No `E_VERSION`, no fatal error, no reboot during any scenario run after the fixes.
- Every simulated state carried `source: "mock"` and was acknowledged by the device.

## 5. Runs performed

| Run | Duration | Result |
| --- | --- | --- |
| `diagnose` after flash (unit A) | 15 s | handshake, 37 ACK, no error |
| `diagnose` after flash (unit C) | 10 s | handshake, 22 ACK, 0 error, 0 resync |
| `full-session`, `permission`, `all-states`, `error`, `multi-session` (unit B) | 10–12 s each | 0 error, 12–18 ACK each |
| Same five scenarios (unit C) | 10 s each | 0 error, 12–18 ACK each |
| Preview run with rotation (unit C) | 180 s | 1 `E_PARSE` at handshake (before D-19), then clean |
| Run after D-19 (unit C) | 20 s | **0 error, 0 resync, 54 ACK** |
| Soak on unit A | 11 min | **failed**: watchdog reset (D-15) |
| Soak on unit B | ~5 min | 0 error; interrupted by the board swap |

## 6. Human observation

- Orientation at 90°: confirmed by the Product Owner as correct for the printed PLA enclosure.
- `MOCK` badge and the scenario states: observed during the demonstration runs.
- Display colours, contrast and flicker after the rotation change: not re-checked screen by screen.

## 7. Still open

1. **One-hour soak** on unit C with the final image (the previous attempt hit D-15 at 11 min).
2. **Heap high-water mark, minimum free heap and FPS** with a diagnostic build
   (`BUDDY_DIAGNOSTICS=1`), which must not be connected to the bridge at the same time.
3. Visual check of all six screens after the rotation, and touch gestures through the enclosure.
4. Re-check of the 4096-byte RX queue: the cause of the dead RX on unit C is unknown; 1024 is the
   validated value and is what ships.
