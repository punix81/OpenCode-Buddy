# Phase 4.1 — controlled A/B matrix

Date: 2026-11-26. Same board, cable, host port, Linux VM, 115200 8N1, esptool 5.7.0 `--no-stub`.
Application-only flashes at `0x10000`, write + independent verify. Every cycle records hello,
ACK 1, ACK 2 and the time to the first ACK; failures are kept in the totals.

## 1. Images

| Id | Source | Build | SHA-256 | Size |
| --- | --- | --- | --- | --- |
| A | archived Phase 3.1 | archived | `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` | 406 128 B |
| A' | Phase 3.1 rebuilt at `8bf3e08` | clean | `798a11f6e960599a7733a0e98a064301ec34aeccc78fabe685939d428fdc5cb1` | 406 128 B |
| A'' | A' + restart command (lab) | clean | `ff37848f258f7635f33cef4fbe588dd02a8a5c9aca745243c0c27ab34c33c00c` | 406 240 B |
| B | archived Phase 4 | archived | `741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e` | 410 656 B |
| B' | Phase 4 rebuilt at `c39b1fa` | clean | `d946c29a22aa5c9566aa4d70f1b1f6119520703459edebed9c1c0085468b09d3` | 410 656 B |
| B'' | B' + restart command (lab) | clean | `85a9c981dec7671185722168e879b30f949e2969483ae47b108ca7f50b35ccb8` | 410 768 B |
| C | parser resync only | clean | `ed350f280e978addc8602f35380e1e5548eb4973dc32c88d3015794bde4ced19` | 411 104 B |
| D | parser resync + RX hygiene (final) | clean | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` | 411 232 B |
| P | D + probe counters (lab) | clean | `26ebecfa47f2d5bc44bddcd9dd16730c182e3d4ab92bddaa992e99775ae8bafe` | 412 912 B |

A' is byte-identical in size to A but not in hash: the build is deterministic for a given tree, yet
the archived binaries were produced under a different path/tool invocation. A' is therefore the
toolchain control, not a reproduction of A.

## 2. Clean software restart, `BUDDY-RESTART`, 1 s after hello

Harness keeps no esptool bytes in the RX FIFO: the port is drained, the command reboots the MCU, the
host reopens and handshakes. 10 cycles each.

| Image | Result | Notes |
| --- | --- | --- |
| A'' Phase 3.1 | **10/10** | hello 2.21 s, ACK at 3.26 s, every cycle |
| B'' Phase 4 | **10/10** | identical timings |

Conclusion: with a clean RX the archived Phase 4 handshakes reliably. The defect needs a cold boot
or a polluted RX; it is not a parser/sequence design error for normal frames.

## 3. esptool-reset amplifier, 10 cycles, 1 s after hello

esptool's ROM-download reset leaves binary bytes in the same USB-Serial-JTAG RX FIFO. This is not a
field scenario, but it deterministically produces "garbage + first frame" lines and is a stable
regression amplifier.

| Image | Result | Notes |
| --- | --- | --- |
| B archived Phase 4 | **0/10** | hello received, no ACK, no error |
| A archived Phase 3.1 | 0/10 | same artifact; proves the harness is not image-specific |
| C parser resync | **10/10** | ACK at 1.5 s, every cycle |

Conclusion: the parser resynchronisation recovers a complete frame behind a garbage prefix. C is the
smallest change that turns 0/10 into 10/10 under this condition.

## 4. Bridge-like open after 15 s without a host, 5 cycles

The port is closed for 15 s (device announces itself), then opened; the first 2.5 s are ignored like
the bridge link-settle, then ready/config are written 1 s after the first post-settle hello.

| Image | Result |
| --- | --- |
| C parser resync only | 5/5 |
| D parser resync + RX hygiene | 5/5 |

Conclusion: a 15 s absence alone does not reproduce the field failure; the cold boot
(re-enumeration + ROM boot without a host) is required. D does not regress this path.

## 5. Physical cold boots, probe build P with counters

Owner unplug/replug, 20 s apart, 4 cycles captured.

| Cycle | Hello | ACK 1/2 | framing resync | Poisoned first line |
| --- | --- | --- | --- | --- |
| 1 | 2.91 s | yes | 1 | `BUDDY-PROBE ms=1mp{"v":` |
| 2 | 0.81 s | yes | 1 | `BUDDY-PROBE ms=1mp{"v":` |
| 3 | 1.01 s | yes | 1 | `BUDDY-PROBE ms=1mp{"v":` |
| 4 | 0.25 s | yes | 1 | `mpty=0 partial=0,"dto":` |

Conclusion: every physical cold boot delivers a self-echo fragment in front of the host's ready; the
resynchronisation recovers it and the device ACKs. **This is the root cause of the Phase 4 blocker.**

## 6. Physical cold boot, real bridge

| Image | Result |
| --- | --- |
| C parser resync only | hello → ready/config → **no ACK**; retries 1–2 no ACK; only the 7 s reopen (device reset) recovered (`final-live2.log`) |
| D final | **not completed** — the owner stopped the session before the series |

The C failure is the field signature reproduced end-to-end with the production bridge; it also shows
that a lost handshake can require the RX-hygiene correction, not only the parser one.

## 7. Not exercised

- 20 cold boots on D with the real bridge (owner stopped).
- 10 software reboots, 10 bridge restarts, 10 USB reconnects on D (only the 10 software restarts and
  10 polluted resets above were run, and on B''/C rather than D).
- A 3600 s soak on D.
