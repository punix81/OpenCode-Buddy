# Handover — after Phase 4.1 (USB CDC recovery)

Date: 2026-11-26
Final local commits: `a68fc1f` (firmware), `2509de8` (bridge), plus this documentation commit.
Device: **`2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`** (411 232 B),
read back independently on 2026-11-27 and matched.
Bridge: LIVE on the 4.1 tree `58bd386`, OpenCode 2.4.1, real tokens/MCP, 0 device error, 0 resync.

## 1. What happened

Phase 4 failed its hardware gate: after cold boots the device sent `hello`/heartbeats but never ACKed
`ready`/`config`. Phase 4.1 established the cause and corrected it:

1. The ESP32-C3 USB Serial/JTAG delivers a **fragment of the device's own transmission** into its RX
   at cold boot. The fragment (16–25 B, no newline) was glued in front of the first `ready`.
2. The parser rejected the merged line; the following `config` became a sequence gap; no ACK was
   generated; pre-link errors are suppressed, so the bridge saw silence.
3. While no host is connected, those fragments accumulate in the line buffer; a long window can grow
   it past 2048 B and swallow the first real frame, defeating a single retry.

Corrections:
- `a68fc1f`: bounded frame resynchronisation (≤4 `{` candidates in the first 192 B, peer type
  required, `framingResyncs()` counter) + RX drain while `!hostConnected()`.
- `2509de8`: bridge replays `ready`/`config` every 2 s (max 3, `ready` restarting at seq 1) before
  the 7 s reopen.
- Host tests: text prefix, JSON prefix, rejected prefix, sequence coherence; bridge test: swallowed
  first attempt acknowledged on the replay.

## 2. Evidence

- `docs/phase-4-1-report.md` — full report and verdict.
- `docs/evidence/phase-4-1-usb-diagnostics.md` — mechanism, minimal experiments, cold-boot probe.
- `docs/evidence/phase-4-1-ab-matrix.md` — image table and every A/B series.
- `docs/evidence/phase-4-1-hardware-validation.md` — final LIVE state and acceptance table.
- `docs/evidence/phase-4-1-soak-test.md` — not run, with the exact plan.
- Logs were under `/tmp/opencode/phase41/` and were removed by the 2026-11-27 host restart. The
  quoted excerpts in the report and the diagnostics file are the durable record; re-capture with
  the same commands if a new session must be documented.

## 3. Acceptance status (2026-11-27)

- **Done**: installed image verified; 4.1 suites (103/103, 24/24, protocol, host, preview 8/8,
  simulator); **10/10 software resets**, **10/10 bridge restarts**, 60 s delayed start, all with
  hello → ACK 1/2 → state on the first attempt; **3600 s MOCK soak PASS** (0 ACK timeout, 0 error,
  0 resync, 0 reconnect, RSS stable); review correction `c4db0b3` (partial ACK) tested on main.
- **Skipped by the Product Owner**: 20 genuine cold boots and 10 USB reconnections. These are the
  remaining acceptance evidence; run them before relying on cold-boot reliability. The probe build
  that shows `framingResyncs` must be rebuilt from the 4.1 commits (its temporary tree was removed
  with `/tmp`).
- **Not re-run**: the six-screen visual tour on this exact image (the Phase 4 physical validation
  stands; the 4.1 corrections do not touch rendering, fonts, gestures or preferences).
- **Next bridge release**: include `c4db0b3` (both handshake ACKs required). It is committed on main
  but was not part of the accepted 4.1 runtime.
- **Not started**: Phase 5 (paused at the Product Owner's request after the audit/prep work), the 8 h
  endurance and the renderer optimisation.

Do not start Phase 5 before these gates. The 8 h endurance and the Session/Tokens renderer
optimisation (90–100 ms) remain Phase 5 work.

## 4. Preserved artifacts

`.backups/phase4-2026-11-26/`:

- `full-flash-pre-phase4.bin` (4 MiB, `70d918e7…9011`).
- `app-phase31-installed.bin` (`280166…e12ad`).
- `firmware-phase4-release.bin` (`741dcb5b…`, 410 656 B).
- `firmware-phase4-release-848b3a99.bin`, `firmware-phase4-diag.bin`.

`/tmp/opencode/phase41/bin/` (transient, reproducible from commits): probe `26ebecfa…`,
previous candidate `ed350f28…`, lab builds `ff37848f…`, `85a9c981…`, `c70d47ea…`,
minimal USB tests `t-rxonly`, `t-rxtx`, `m1-hello140`, `m2-hello164`.

The Phase 3.1 backups under `.backups/phase31-2026-11-26/` are untouched.

## 5. Known traps

- Opening the CDC port can reset the ESP32-C3. Killing the bridge while it owns the port and retrying
  esptool can wedge the port (`Write timeout`, mute device); a physical unplug/replug recovers it.
- The USB port is single-owner; stop the bridge before esptool or a manual probe.
- A long no-host window is now harmless for the line buffer (RX is drained while disconnected), but
  the bootstrap still sends `heartbeat` before the first periodic `hello`; the bridge must not treat
  a heartbeat as a handshake trigger (it does not).
- Do not change GPIOs, rotation, USB architecture, privacy or the Codex Astra design.
- Do not use GitHub; `AGENTS.md` §8 applies.

## 6. Commands

```sh
cd bridge && npm run typecheck
cd bridge && npx tsx --test test/*.test.ts
cd bridge && npm run test:plugin
cd bridge && npm run validate:protocol
bash firmware/test/host/run.sh
cd tools/ui-preview && python3 -m unittest -q test_preview.py
cd firmware && ../.venv/bin/pio run -e supermini
cd bridge && npm run live -- --log-level debug
```

Never run `opencode service restart` while an agent session is active. Stop the bridge with a normal
signal; do not delete a live lock/socket/token.
