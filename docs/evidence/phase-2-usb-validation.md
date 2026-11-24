# Phase 2 — USB write-path review and validation

Date: 2026-11-24
Scope: the firmware → host direction, the TX path, and the events that led to D-15.
Classification: VERIFIED (measured or read from the installed core), ASSUMPTION, NOT VERIFIED.

## 1. What the core actually does

Source: `framework-arduinoespressif32` 3.20014.231204 (arduino-esp32 2.0.14), `cores/esp32/HWCDC.cpp`.

| Fact | Evidence | Class |
| --- | --- | --- |
| `Serial` is `HWCDC` (native USB-JTAG/CDC) for this board configuration | `-DARDUINO_USB_MODE=1`, `-DARDUINO_USB_CDC_ON_BOOT=1`; `HWCDC.cpp` defines `HWCDC Serial` | VERIFIED |
| `begin()` allocates a **256-byte TX ring** and a 256-byte RX queue if not preset | `HWCDC::begin` calls `setTxBufferSize(256)` / `setRxBufferSize(256)` | VERIFIED |
| `availableForWrite()` returns the ring's free bytes | `xRingbufferGetCurFreeSize` under the TX mutex | VERIFIED |
| Measured free space at idle on the device | diagnostic line: `txfree=256` | VERIFIED |
| `write()` fills what fits without blocking, then loops **blocking** for the rest with `tx_timeout_ms` | `HWCDC::write` | VERIFIED |
| `tx_timeout_ms` is 0 until the host connects, then 100 | ISR sets 100 ms on the CONNECTED event | VERIFIED |
| The loop task watchdog is **disabled** by this core | `loopTaskWDTEnabled = false` in `app_main` | VERIFIED |

Consequence: the earlier explanation "a blocking write made the watchdog reboot the board" is **not
supported** by the core sources. The board did reset during the first soak (the USB device
re-enumerated), but the cause of that reset is **NOT VERIFIED**. It could be a panic, a brown-out, a
USB-level event, or the host side. The one-hour soak in `phase-2-soak-test.md` is the test that can
confirm or refute a recurrence.

## 2. Frame sizes

| Direction | Frame | Bytes | Fits the 256-byte TX ring |
| --- | --- | --- | --- |
| device → host | `hello` | 114 | yes |
| device → host | `heartbeat` | 34 | yes |
| device → host | `ack` | 60–62 | yes |
| device → host | `resync` | 85–88 | yes |
| device → host | `error` | 94–97 | yes |
| device → host | `interaction` | ≤ 80 | yes |
| host → device | `ready` | 83 | RX side |
| host → device | `config` | 210 | RX side |
| host → device | `state` | 525–551 | RX side |
| host → device | `mcp_status` | 94–173 | RX side |

The device never sends a `state` frame, so the 256-byte TX ring is never asked to carry more than
114 bytes. The RX queue (1024 B) is what carries the bridge's larger frames; measured over 45 s of
stress, every one of the 452 expected acknowledgements arrived.

## 3. Write path as implemented

`firmware/src/FrameWriter.h` now owns the path:

1. the frame and its terminating `\n` are written in **one** `write()` call, so a short write can
   never leave a payload without a newline, and no later frame can be concatenated onto a partial
   one;
2. a frame is only started when `availableForWrite()` reports room for all of it, which is exactly the
   condition under which `HWCDC::write` completes in its first non-blocking step and never enters the
   blocking loop;
3. the return value is compared with the requested size; a short write is counted as
   `DroppedPartial` instead of being silently accepted;
4. a frame larger than the buffer, or with zero length, is counted as `DroppedTooLong`;
5. counters (`sent`, `droppedNoSpace`, `droppedPartial`, `droppedTooLong`, `maxFrame`) are exposed in
   the diagnostic build.

## 4. Regression tests (host)

`firmware/test/host/test_protocol.cpp` covers, with a fake sink:

| Case | Expectation | Result |
| --- | --- | --- |
| Buffer free space exactly equals frame + newline | `Sent`, bytes end with `\n` | PASS |
| Free space one byte short | `DroppedNoSpace`, nothing written | PASS |
| Sink accepts fewer bytes than requested | `DroppedPartial` counted | PASS |
| Frame larger than the buffer | `DroppedTooLong` | PASS |

## 5. Critical frames

- `ack` is coalesced in the parser: if one is dropped, the next applied message produces a new one.
- `heartbeat` repeats every 2 s; a lost heartbeat costs at most one interval.
- `hello` repeats every 3 s while no session exists; a lost announcement costs at most one interval.
- `error` and `resync` are best-effort notifications; losing one does not change state.
- `interaction` is the only frame that carries user input. If it is dropped, the host was not reading
  at that instant; there is nothing to retry against.

## 6. Bridge side

The bridge does not retransmit and does not assume delivery. It logs every acknowledgement with its
value and exposes per-type counters (`bridge.stats`) so a soak can compare what was sent with what the
device acknowledged. A missing acknowledgement therefore shows up as a count difference, never as a
silent success.

## 7. Conformance fix found by this review

A probe with an over-long `agent` value made the device answer `E_PARSE` while the bridge validator
answers `E_BOUNDS`. The firmware now distinguishes "not a string" (`E_PARSE`) from "string longer than
the documented maximum" (`E_BOUNDS`) for `model` (40) and `agent` (24). A host test asserts the code
and that the previous state survives.

## 8. Limits of this validation

- USB saturation and partial writes are counted only in the diagnostic build; in the release build
  they are inferred from `E_PARSE`, `E_TOO_LONG`, `resync` and missing acknowledgements.
- `availableForWrite()` itself takes the TX mutex with a 100 ms timeout, so a pathological ISR stall
  could delay one loop iteration. Not observed.
- The cause of the 4096-byte RX failure remains NOT VERIFIED; 1024 is the shipped value.
