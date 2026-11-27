# Phase 4.1 — USB CDC diagnostics and root cause

Date: 2026-11-26
Scope: the intermittent "hello/heartbeats but no ACK" failure of the Phase 4 image after cold boots.
Device: ESP32-C3 DevKitM-1, MAC `44:BD:8D:4E:27:A4`, native USB-Serial-JTAG (`303a:1001`).
Host: same Linux VM, same cable and port as Phase 4. Toolchain: PlatformIO `espressif32@6.5.0`,
Arduino core `2.0.14`, esptool 5.7.0 `--no-stub`.

All statements are classified: **VERIFIED** (produced in this session), **ASSUMPTION** or
**NOT VERIFIED**.

## 1. Symptom, confirmed with the real bridge

VERIFIED, `/tmp/opencode/phase41/final-live2.log` (image `ed350f28…`, previous candidate):

```
20:29:49.926 hello boot=1 caps=config.partial,state.opencodeVersion
20:29:51.021 protocol out type=ready seq=1
20:29:51.021 protocol out type=config seq=2
20:29:53.028 WARN handshake retry 1 (no ACK)
20:29:55.033 WARN handshake retry 2 (no ACK)
20:29:56.939 bridge status=reconnecting          <- 7 s handshake timeout, port reopened
20:29:58.335 bridge status=handshaking
20:30:02.074 hello boot=1
20:30:03.159 ack received ack=1
20:30:03.159 ack received ack=2                  <- only the reopen (device reboot) recovered
```

The device received `hello`/`heartbeat`-free silence on the ready/config; no `ack`, no `error`
frame, no `resync`. The reopen at 20:29:56 resets the board (opening the CDC port), and the next
session handshakes immediately. This is the Phase 4 field signature.

## 2. Mechanism — the device receives a fragment of its own transmission

### 2.1 Minimal USB experiment (no application code)

A test firmware that only receives (`t-rxonly`) reports `bytes=0` after 10 s with no host write;
a host marker arrives exactly. VERIFIED: the RX path itself is sound.

A test firmware that transmits a line every 250 ms (`t-rxtx`) receives **its own output** into RX:

```
USBTEST-REPORT n=1 bytes=25 len=25 data=USBTEST tick ms=USBTE 0le
TX HOSTMARK
USBTEST-REPORT n=2 bytes=39 len=39 data=USBTEST tick ms=USBTE 0leHOSTMARK-1234
```

VERIFIED: with the host closed, a garbled prefix of the device's own line is delivered into its RX
ring; the next host bytes are appended to it. The fragment has no newline.

### 2.2 On the Phase 4 probe build, physical cold boots

A temporary probe build (`26ebecfa…`) adds bounded counters and prints the line the parser saw. On
four physical cold boots (owner unplug/replug), each handshake was preceded by a corrupted first
line, e.g.:

```
BUDDY-PLINE i=0 ms=4419 code=0 len=101 head=BUDDY-PROBE ms=1mp{"v": tail=abcd1234"}}
BUDDY-PLINE i=0 ms=10428 code=0 len=106 head=mpty=0 partial=0,"dto": tail=abcd1234"}}
```

The head is a fragment of the probe line (or of a heartbeat/hello) glued in front of the host's
`ready`. With the uncorrected parser this line is `ParseError`; the following `config` is then a
`Gap`; no ACK is sent. The firmware suppresses error frames before the link is ready, so the bridge
sees nothing.

VERIFIED: 4/4 cold boots, `framing=1` each (the new recovery counted one resynchronisation) and
ACK 1/2 within 1.31–3.97 s. The fragments are always short (16–25 B) and never contain a valid
JSON frame, but they may contain `{` and `"data"`.

### 2.3 Why the no-host window matters

The fragment is produced when the device transmits **while no host consumes the TX**: it stays in
the peripheral/ring and is fed back into RX. During a cold boot the host is absent for seconds
(bridge re-discovery after re-enumeration), so the device accumulates fragments in the same line
buffer. A long absence can grow that line to the 2048-byte limit (`TooLong`), and the first real
frame is then discarded with it. VERIFIED with `bridge_like` and the real bridge: the retry alone
was not enough; only a port reopen (device reset) recovered.

## 3. Corrections

1. **Parser frame resynchronisation** (`ProtocolParser.cpp`, `a68fc1f`). After a deserialization
   error, at most four `{` starts are tried within the first 192 bytes; the first candidate that
   deserializes to a complete object with a peer type (`ready`, `config`, `state`, `mcp_status`,
   `heartbeat`, `ack`, `error`) is used. Validation is unchanged; the recovery is counted in
   `framingResyncs()`. A line without any valid peer frame remains `ParseError` and does not touch
   the sequence.
2. **RX hygiene while disconnected** (`SerialManager.cpp`, `main.cpp`, `a68fc1f`). Every loop with
   `!hostConnected()` drains the RX ring and clears the partial line, so self-echo never reaches the
   framer. No legitimate host byte can be lost: `HWCDC::operator bool()` is only true after a host
   has opened the port and read a frame.
3. **Bridge handshake retry** (`bridge.ts`, `2509de8`). After ready/config, replay both every 2 s
   (max 3) with `ready` restarted at seq 1; clear on the handshake ACK. The 7 s reopen stays as the
   last resort.

## 4. A/B evidence

| Experiment | Image | Result |
| --- | --- | --- |
| esptool-polluted reset, 10 cycles | archived Phase 4 `741dcb5b…` | **0/10** full handshakes |
| esptool-polluted reset, 10 cycles | fixed `2ff67b71…` | **10/10** |
| clean software restart (`BUDDY-RESTART`), 10 cycles | Phase 3.1 `ff37848f…` lab build | 10/10 |
| clean software restart, 10 cycles | Phase 4 archived lab build `85a9c981…` | 10/10 |
| 15 s host absence then bridge-like open, 5 cycles | previous `ed350f28…` | 5/5 |
| 15 s host absence, 5 cycles | final `2ff67b71…` | 5/5 |
| physical cold boot, probe with counters | fixed parser | 4/4, `framing=1` each |
| physical cold boot, real bridge | previous `ed350f28…` | hello, no ACK, retries ineffective, reopen recovered |
| physical cold boot series, real bridge | final `2ff67b71…` | **not completed — owner stopped the session** |

The esptool-polluted harness is not the field trigger (a ROM-download reset leaves binary bytes in
the same RX FIFO); both images fail it without the parser fix, which is why it is a useful
regression amplifier, not a root-cause proof. The root-cause proof is §2.2 with physical cold boots.

## 5. Artifacts

| Artifact | SHA-256 | Size |
| --- | --- | --- |
| Final release `2ff67b71…` | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` | 411 232 B |
| Previous candidate `ed350f28…` | `ed350f280e978addc8602f35380e1e5548eb4973dc32c88d3015794bde4ced19` | 411 104 B |
| Probe build | `26ebecfa47f2d5bc44bddcd9dd16730c182e3d4ab92bddaa992e99775ae8bafe` | 412 912 B |
| Phase 3.1 lab build | `ff37848f258f7635f33cef4fbe588dd02a8a5c9aca745243c0c27ab34c33c00c` | 406 240 B |
| Phase 4 lab build | `85a9c981dec7671185722168e879b30f949e2969483ae47b108ca7f50b35ccb8` | 410 768 B |
| Fixed lab build | `c70d47eadf836329799c65315d4d640ebafa1581019818b40736c7f6ee22c434` | 411 232 B |
| Archived Phase 4 | `741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e` | 410 656 B |
| Archived Phase 3.1 | `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` | 406 128 B |

All experimental images live under `/tmp/opencode/phase41/bin/` (transient) and are reproducible from
the local commits; the installed release is verified at `0x10000` and matches `2ff67b71…`.


> **Evidence retention (2026-11-27).** The `/tmp/opencode/phase41/` logs and experimental
> binaries were transient and were removed when the host restarted. The excerpts quoted in this
> document are the durable record; the release and archived images live in
> `firmware/.pio/build/supermini/` and `.backups/`. Probe and lab builds are reproducible from the
> local commits plus the documented diagnostic patch.

## 6. Open items

- **NOT VERIFIED**: the final image has not been through a physical cold-boot series with the real
  bridge since the RX-hygiene fix. The owner stopped the session; resume with 20 cold boots.
- **NOT VERIFIED**: a 3600 s soak on the final image.
- **ASSUMPTION**: the USB-Serial-JTAG/hypervisor interaction that feeds a TX fragment into RX is a
  silicon/driver behaviour of this host; the corrections are defensive and do not depend on its
  exact origin. The VMware virtual hub is a plausible contributing factor (the device is attached to
  a `VMware, Inc. Virtual USB Hub`).
- The 3.1 image is not immune in principle; its hello size/timing simply lost the race less often.
