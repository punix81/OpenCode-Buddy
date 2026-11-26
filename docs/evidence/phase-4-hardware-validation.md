# Phase 4 — hardware validation evidence

Date: 2026-11-26
Verdict: **FAIL — BLOCKER USB CDC RX on the Phase 4 image. Phase 3.1 restored.**
The Phase 4 software suites pass; the installed Phase 4 image did not reliably accept the handshake
after boot. The previously validated Phase 3.1 image is installed and LIVE.

## 1. Artifacts

| Artifact | SHA-256 | Size | State |
| --- | --- | --- | --- |
| Phase 4 release (authorized baseline) | `741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e` | 410 656 B | flashed and verified; **removed** after validation |
| Phase 4 release experiment (host-gated announcements) | `848b3a99a194d6601eab7b24d68356008d1f17fb40017344c8f4352bb51e84cc` | 410 736 B | flashed/verified for isolation; removed |
| Phase 4 diagnostic (MOCK + bench commands) | `bdaac7733e40c3a1e525ebd8f842edc079bfeb1daa1f1a2ba0645497fc60c9b1` | 413 392 B | flashed for performance; removed |
| Phase 3.1 release (restored) | `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` | 406 128 B | **installed and verified** |

Backups in `.backups/phase4-2026-11-26/`:

- `full-flash-pre-phase4.bin` — 4 194 304 B, sha256 `70d918e7aa799392f439178ff150bc63944b44f1fdc3cb72bc7a8ee189119011`.
- `app-phase31-installed.bin` — extracted at `0x10000`, 406 128 B, sha256 `280166…e12ad` (matches the
  installed Phase 3.1 application).
- `firmware-phase4-release.bin` — the 741dcb image.
- `firmware-phase4-release-741dcb5b.bin`, `firmware-phase4-release-848b3a99.bin`,
  `firmware-phase4-diag.bin` — preserved variants.
- Phase 3.1 backups under `.backups/phase31-2026-11-26/` untouched.

## 2. Flash procedure

- Device: ESP32-C3, MAC `44:bd:8d:4e:27:a4`, USB `303a:1001`, 4 MB flash.
- Bridge stopped; single owner of `/dev/ttyACM0` verified.
- Full read before any write; app extracted and hash-matched to Phase 3.1.
- Application only at `0x10000`, esptool **5.7.0**, `--no-stub`; bootloader, partitions and NVS not
  rewritten.
- Phase 4 write + independent `verify-flash`: digest matched.
- After the Phase 4 failure, Phase 3.1 write + verify: digest matched; handshake immediately ACKed.

## 3. USB protocol result — BLOCKER on Phase 4

### Phase 4 image

After several cold boots (physical USB unplug/replug) and several bridge restarts, the device sent
`hello` (164 B, caps `config.partial,state.opencodeVersion`) and heartbeats, but **never acknowledged
`ready`/`config`** and never sent an ACK or an error. The bridge logged:

```
hello boot=1 caps=config.partial,state.opencodeVersion
config seq=2 bytes=176
... no ack received ...
handshake not acknowledged after ~7000 ms
```

The bridge improvements made for this validation were all active:

- 2.5 s link settle: the buffered hello/heartbeat backlog was read and discarded before writing
  (observed 13–19 frames drained).
- 1 s handshake delay after `hello`.
- Blank-line prime before `ready`.
- No-ACK timeout: reopen the port and reset the device after 7 s.
- Duplicate heartbeats no longer consume the outbound ACK sequence.

None of them restored the Phase 4 RX. A manual Python probe (open, read hello, wait 1.5 s, send
`ready`/`config`) also received no ACK, so this is not a bridge write-timing artifact.

### Phase 3.1 control

The same device, cable, host, bridge and procedure with the Phase 3.1 image:

```
hello boot=1 caps=config.partial (140 B)
config seq=2 bytes=176
ack received ack=1, ack=2
state status=thinking sessions=1 source=live
mcp online=8 total=12
device errors: 0
resync: 0
```

The Phase 3.1 image handshakes immediately on the first cold boot. This isolates the failure to the
Phase 4 image (or its boot/USB interaction), not the host, cable or bridge.

### Likely area for Phase 5

The Phase 4 hello is 24 B larger (164 vs 140) because of the optional capability; the Phase 4 firmware
also renders a slower dashboard at boot. The exact mechanism (CDC TX backlog, endpoint stall during
boot, or a subtle USB timing interaction) is **NOT VERIFIED**. Phase 5 must isolate it with a minimal
image/A-B test before any further Phase 4 flash. The bridge now drains the backlog, so the remaining
failure is firmware-side or USB-stack-side.

## 4. Functional results — Phase 4 image (before the blocker)

These were observed on the Phase 4 image while it was alive and are **VERIFIED** for the UI/behavior;
they do not remove the USB blocker.

| Check | Result |
| --- | --- |
| English six-screen tour | VERIFIED by the Product Owner |
| French six-screen tour (accents, `TOTAL SESSION`, `ENTRÉE`/`SORTIE`, `CTX --`, `RADAR MCP`) | VERIFIED |
| German six-screen tour (`SITZUNG`, `WERKZEUGE`, `Läuft`, `Berechtigung`, seven System rows) | VERIFIED |
| Immediate language change without reboot (FR, DE) | VERIFIED |
| Language persistence: bridge restart, USB/MCU power cycle | VERIFIED |
| Explicit `quietMode` override and persistence | VERIFIED |
| Explicit override reapplied after very-long reset | VERIFIED |
| Very-long reset (English, loud, Buddy) | VERIFIED; one `very_long`, no extra `long` |
| Short press navigation, long press quiet | VERIFIED |
| Auto-return 90 s (no premature return, return to Buddy) | VERIFIED |
| Auto-return timer reset (20 s chrono) | VERIFIED |
| Quiet disables auto-return; loud re-enables it | VERIFIED |
| MOCK all-states: permission, input, retry, success, interrupted, notifications | VERIFIED |
| System OpenCode version `2.4.1` | VERIFIED |
| MCP 8/12 and subset caption | VERIFIED |
| Tokens `SESSION TOTAL` / `CTX --` / real values | VERIFIED |
| Performance (diagnostic image) | PARTIALLY VERIFIED — see `phase-4-performance.md` |

## 5. Final state

- Phase 3.1 release `280166…e12ad` installed and verified.
- Bridge LIVE with the Phase 4 bridge code (compatibility + robustness fixes), one OpenCode peer,
  MCP 8/12, real tokens, **0 device error / 0 resync** in the final window.
- No diagnostic firmware installed.
- The Phase 4 image remains preserved in `.backups/phase4-2026-11-26/` for Phase 5.
- No GitHub operation.

## 6. Recommendation

Do not retry Phase 4 hardware acceptance until Phase 5 has isolated the USB CDC RX regression with a
minimal A/B image (Phase 3.1 hello vs Phase 4 hello, with and without the new capability, with a
deliberate no-host backlog). Keep Phase 3.1 installed for daily use.

## 7. Interaction log excerpts

All timestamps are UTC, from the bridge `interaction` frames; the bridge log is the source.

| Check | Evidence |
| --- | --- |
| French six-screen tour | `short screen=1..5` at 17:19:09–17:19:20, back to 0 at 17:19:27 |
| German six-screen tour | `short screen=1..5` at 17:21:40–17:21:47, back to 0 at 17:21:48 |
| English six-screen tour | `short screen=1..5` at 17:22:53–17:22:58, back to 0 at 17:22:59 |
| First (too short) long attempt | `long screen=0` at 17:08:05; explained to the owner, retried |
| Very-long reset | exactly one `very_long screen=0` at 17:09:44; no following `long` |
| Double press | `double screen=0` at 19:01:55 on the restored Phase 3.1 image; the first attempt was two slow short presses and was correctly not a double |
| Quiet toggle | `long screen=1` at 17:42:05; no `very_long` |
| Auto-return 90 s | `short screen=1` at 17:23:45; owner confirmed still on Session at ~69 s and back on Buddy by ~109 s |
| Auto-return 20 s / timer reset | `short screen=1` at 17:39:18, `short screen=2` at 17:39:20; owner measured ~20 s after the second press (reset works) |
| Auto-return 10 s / earlier timer check | `short screen=1` at 17:27:12, `short screen=2` at 17:27:18; the first owner estimate (~4 s) was ambiguous, repeated with 20 s and a stopwatch |
| MOCK all-states | permission at 17:43:38, input at 17:43:41, retrying at 17:43:43, success at 17:43:47, interrupted at 17:43:49; source=mock |

The Owner confirmed each visual result in the conversation; the logs above are the machine-side
corroboration, not a substitute for the visual confirmation.
