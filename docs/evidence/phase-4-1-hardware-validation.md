# Phase 4.1 — hardware validation

Date: 2026-11-26
Installed image: **D** `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`,
411 232 B, written at `0x10000` and verified (`Verification successful (digest matched)`).
Bridge: LIVE on the final code, one OpenCode 2.4.1 peer, real MCP/tokens.

## 1. Final LIVE state (VERIFIED)

`/tmp/opencode/phase41/final-live3.log`, 2026-11-26:

```
20:35:41.640 hello boot=1 caps=config.partial,state.opencodeVersion
20:35:41.640 bridge status=ready
20:35:42.725 ack received ack=1
20:35:42.725 ack received ack=2
20:35:42.822 state status=working sessions=1 tokens=435422569/374229 tools=0/0/1 source=live
...
20:41:35.664 state status=generating sessions=1 tokens=435896153/374533 tools=2/0/0 source=live
```

- handshake on the first attempt, no retry (`grep handshake retry` → 0);
- device errors 0, resync 0, host-side invalid messages 0;
- real token counters, real tool counters, real session status, source=live;
- USB `303a:1001`, `/dev/ttyACM0` 166:0, single owner.

## 2. Physical cold boots

### 2.1 Probe build P — mechanism and recovery (VERIFIED)

4 cold boots with the probe build (`26ebecfa…`, D + counters):
hello 0.25–2.91 s, **ACK 1/2 on every boot**, `framing=1` on every boot, first parsed line always
prefixed by a self-echo fragment (heads in `phase-4-1-usb-diagnostics.md` §2.2).

### 2.2 Real bridge, previous candidate C (VERIFIED failure)

One physical cold boot reproduced the field signature: hello at 20:29:49, ready/config at
20:29:51, retries 1–2 unanswered, 7 s timeout, reopen, then ACK 1/2 at 20:30:03. The failure and the
rescue by the reopen are both in `final-live2.log`.

### 2.3 Real bridge, final image D (NOT COMPLETED)

The owner stopped the hardware session before the 5-cycle series could be run. **No physical cold
boot of D with the production bridge has been recorded.** The RX-hygiene correction is supported by
the mechanism in §2.1 and by the bridge-like harness (5/5), not by a completed cold-boot series.

## 3. UI, localization, preferences, gestures

These were validated on the Phase 4 image before the blocker (`docs/evidence/phase-4-hardware-validation.md`):
six screens, EN/FR/DE, accents, immediate language switch, persistence across bridge/USB/MCU
restarts, explicit quiet override, very-long reset, all four gestures, auto-return 90/20/10 s, MOCK
permission/input/retry/terminal states, System 2.4.1, MCP 8/12.

The 4.1 corrections touch the protocol parser, the RX drain while disconnected and the bridge
handshake only. No renderer, font, preference or gesture code changed. A re-run of the visual tour on
D was **not** performed today; it remains a Phase 5 acceptance item (the owner may repeat the tour
without a flash).

## 4. USB recovery behaviour (VERIFIED)

- Killing the bridge while it owns the port and retrying esptool produced `Write timeout` on the ROM
  sync and a mute device: no hello, no data.
- A physical unplug/replug recovered it immediately (ROM banner, then heartbeat/hello).
- This matches the known trap in `docs/troubleshooting.md`; no diagnostic image was left installed.

## 5. Acceptance table

| Criterion | Result |
| --- | --- |
| USB regression mechanism identified | VERIFIED (`phase-4-1-usb-diagnostics.md`) |
| Root-cause correction implemented | parser resync + RX hygiene + bridge retry (`a68fc1f`, `2509de8`) |
| Parser recovery on physical cold boots | 4/4 (probe P) |
| Real-bridge cold boot on the final image | **NOT COMPLETED** (owner stopped) |
| 20 cold boots / 10 reboots / 10 bridge restarts / 10 reconnects | **NOT COMPLETED** on D |
| 3600 s soak | **NOT RUN** |
| All six screens / EN-FR-DE / gestures / preferences | VERIFIED on Phase 4, not re-run on D |
| Automated suites | bridge 103/103, plugin 24/24, protocol PASS, host 4 suites, preview 8/8 |
| Final image archived and independently verified | VERIFIED (`2ff67b71…`, flash read-back) |
| LIVE on real OpenCode data | VERIFIED (`final-live3.log`) |

## 7. Final acceptance session — 2026-11-27

### 7.1 Installed image (VERIFIED)

The application region was read back independently (esptool 5.7.0, `--no-stub`, `read-flash 0x10000
411232`) and compared with the archived release:

```
2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2  read-back (411 232 B)
2ff67b71…                                                        firmware/.pio/build/supermini/firmware.bin
```

Digest identical. Bridge used for the series: `58bd386` (Phase 4.1 tree, `bridge/src/bridge.ts`),
started from a separate worktree so the later Phase 5 work does not contaminate the acceptance.

### 7.2 Suite baseline at `58bd386` (VERIFIED)

TypeScript typecheck PASS; bridge **103/103**; plugin **24/24**; protocol 12 valid / 14 invalid;
firmware host 4/4; preview **8/8**; simulator `all-states` PASS. (The preview binary is a local build
artifact; it was linked into the worktree, not rebuilt.)

### 7.3 Executed handshake series (all PASS, every attempt recorded)

| Series | Cycles | Result | Detail |
| --- | --- | --- | --- |
| Initial open (device already running) | 1 | PASS | hello → ACK 1/2 → state, 0 retry |
| Software reboot (esptool watchdog reset, **not** a power cycle) + bridge restart | 10 | **10/10** | S01–S10: hello, ACK 1/2, state, 0 retry, 0 error, 0 invalid, 0 resync |
| Bridge restart (port open resets the board) | 10 | **10/10** | B01–B10: same criteria |
| Delayed bridge start after 60 s with no host | 1 | PASS | hello at 5.7 s, ACK 1/2, state |
| Soak start (MOCK) | 1 | PASS | see `phase-4-1-soak-evidence.md` |
| Cold boot (genuine power cycle) | 20 | **SKIPPED** | Product Owner had no time; explicitly skipped |
| USB reconnection | 10 | **SKIPPED** | same physical action as the cold boot; skipped with it |

No failed attempt in the executed series. The cold-boot/reconnection series is the only missing
criterion; the device was not power-cycled during this session.

### 7.4 Clarification of the "0/5" figure

The Phase 4.1 report's "0/5 on the final image with bridge" means **zero of the five planned cycles
were executed**, not five failures. The owner stopped the previous session before the series. The
only real-bridge cold boot with a pre-final candidate failed (documented above); the final image was
never cold-booted with the production bridge before this session, and the 20-cycle series remains
unexecuted.

### 7.5 Visual regression (pending)

The six screens, EN/FR/DE, accents, tokens, MCP 12/8, OpenCode version, quiet mode, preferences,
gestures and auto-return were physically validated on the Phase 4 image; the 4.1 corrections do not
touch rendering, fonts, gestures or preferences. A new visual confirmation on this exact image is
**not yet recorded**; it is requested after the soak returns the device to LIVE.

### 7.6 The earlier 07:56 failure

The failure recorded in sections 1–6 happened during the **Phase 5** session with a later bridge on
the same image. It is retained as evidence of the boot-window risk and is **not** an acceptance
result of the 4.1 series above; in this session every executed handshake passed on the first attempt.
