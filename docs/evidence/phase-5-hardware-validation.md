# Phase 5 — hardware validation (P5-00)

Date: 2026-11-27
Status: **BLOCKED at the first P5-00 gate.** The installed Phase 4.1 image still loses the first
handshake after the bridge opens the port; the three handshake retries do not recover it, only a
reopen (device reset) does.

## 1. Environment

| Item | Value |
| --- | --- |
| Firmware | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` (Phase 4.1 release) |
| Bridge | `aac8a35` (Phase 5 P1/P2 fixes; handshake policy unchanged from `2509de8`) |
| OpenCode | 2.4.1, two plugin peers (two project locations) |
| Port | `/dev/ttyACM0`, `303a:1001`, native USB-Serial-JTAG |
| Log | `/tmp/opencode/p5/live-coldboot.log` (transient) |

## 2. Reproduced failure (VERIFIED)

The bridge was started with the device already running; opening the port resets the board. The first
session after that reset never completed:

```
07:55:56.360 bridge opening
07:55:56.599 invalid message code=E_PARSE          <- boot backlog corruption (host RX)
07:56:02.080 hello boot=1 caps=config.partial,state.opencodeVersion
07:56:03.119 protocol out ready seq=1 / config seq=2
07:56:04.080 protocol in heartbeat seq=2
07:56:05.120 protocol in hello seq=1 (duplicate boot, re-announcement)
07:56:05.122 handshake retry 1 (no ACK)
07:56:07.127 handshake retry 2 (no ACK)
07:56:09.133 handshake retry 3 (no ACK)
07:56:09.133 bridge status=reconnecting           <- 7 s timeout
07:56:14.228 hello boot=1 (after the reopen reset)
07:56:15.245 ready/config
07:56:17.250 handshake retry 1
07:56:17.270 ack received ack=1 / ack=2           <- only the retry of the second boot
07:56:17.351 state status=thinking ... source=live
```

`tools/qa/cold_boot_log.py` summary: `1/2 sessions fully handshaken` — session 1 FAIL (3 retries,
1 invalid line), session 2 PASS (1 retry). Both boots had a hello; no device error and no resync were
reported.

This is the same signature as the Phase 4 blocker and the Phase 4.1 real-bridge failure: the device
receives ready/config but does not acknowledge them, and the device keeps announcing itself.

## 3. What is already ruled out or protected

- The parser recovers a complete frame behind an invalid prefix (Phase 4.1, 4/4 cold boots on the
  probe build), so a short prefix alone does not explain a lost **retry** at 2 s and 4 s.
- The firmware drains RX while `HWCDC::operator bool()` is false. That indicator becomes true as soon
  as the host has read any TX (the ROM banner or a buffered hello), which happens **before** the
  application's first handshake. The discard therefore does not cover the whole boot window.
- The bridge's link settle (2.5 s) ignores parsed frames but does not stop the device from
  transmitting; a boot backlog can still be draining during the first ready.
- The 7 s reopen resets the board; the next boot handshakes. The failure is tied to the first boot
  after a port open, not to the steady state.

## 4. Working hypothesis (to confirm with device counters)

During the first boot after a port open the device's TX ring holds a backlog (hello/heartbeat frames
produced while the host was absent or opening). The pre-handshake heartbeat (every 2 s) and the 3 s
hello keep the ring busy; a fragment of the device's own transmission is delivered into its RX and
**grows the line buffer** or is glued to the ready. The parser recovery handles short prefixes, but a
line that exceeds 2048 B is discarded whole (`TooLong`), and the following retry can meet a new
fragment. The host's RX also sees one corrupted line (`E_PARSE`), which proves the TX side is
producing merged/truncated frames during the boot window.

Candidate corrections (not implemented pending evidence):

1. Do not send heartbeats while the link is not ready; only the 3 s hello (halves pre-handshake TX).
2. After the first host byte is seen, suppress further hellos for a bounded grace window so the
   bridge's retries run on a quiet link; resume if no session is established.
3. Discard RX lines that do not start with `{` **and** reset the partial line before the first
   handshake (belt and braces around the parser recovery), so an oversized boot line can never
   swallow a retry.
4. Bridge: after the initial 1 s delay, retry within the device's quiet window (for example 1.2 s
   after a hello) rather than on a fixed 2 s timer.

A diagnostic build with bounded counters (RX bytes, lines, framing resyncs, parser code, line
length, TX drop counts, hello/heartbeat counters) is required to distinguish "ready lost as
TooLong", "ready merged and rejected", and "ready never read". It is a **separate flash** and
requires the Product Owner's explicit approval. The release binary is preserved.

## 5. Not started

The 20 cold boots, 10 software reboots, 10 bridge restarts, 10 USB reconnects, the six-screen tour
and the 3600 s soak were **not** started: running them on an image that fails the first handshake
would only record known failures. They resume after the correction and a new approval.

## 6. Normal restarts after the failure (VERIFIED, 2026-11-27 08:00)

After the blocked first session, eight immediate bridge restarts (each one reopens the port and
resets the board) were recorded:

| Series | Retry constant | Result |
| --- | --- | --- |
| A | 300 ms (temporary experiment) | 5/5 first sessions PASS, 0 retries, 0 invalid |
| B | 2000 ms (the shipped value, restored) | 3/3 first sessions PASS, 0 retries, 0 invalid |

Conclusion: the 300 ms experiment was **not** the cause of the improvement and was reverted; the
failure is not reproduced by immediate restarts. It is tied to the first port open after a long
device uptime without a host (the device had been running since the previous day). This makes the
physical cold-boot series the decisive test: a real power cycle creates the same "device boots with
no host, then the bridge opens" condition.

The bridge constant and the firmware are unchanged from the shipped Phase 4.1 state; no diagnostic
image is installed.
