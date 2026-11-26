# Phase 4.1 — USB CDC regression investigation and recovery

Date: 2026-11-26
Verdict: **PASS WITH RESERVATIONS.** The blocker is explained and corrected, the final image is
installed, verified and LIVE with real OpenCode data; the full physical cold-boot series and the
one-hour soak were not completed because the Product Owner stopped the hardware session.

## 1. Summary

The Phase 4 image failed because the ESP32-C3 USB Serial/JTAG delivered a **fragment of the device's
own transmission into its RX path** at cold boot. The fragment (16–25 B, no newline) was glued in
front of the bridge's first `ready` frame; the parser rejected the merged line, the following
`config` became a sequence gap, no ACK was sent, and the firmware suppresses error frames before the
link is ready — so the bridge saw silence.

Two corrections were needed, not one:
1. the parser must recover a complete frame behind a garbage prefix (bounded, strict, counted);
2. when no host is connected, the device must drop what it receives, because it can only be its own
   echo; otherwise the line buffer grows until a real frame is lost (`TooLong`), which happened with
   the production bridge and defeated the parser fix alone.

A third, defensive correction replays an unacknowledged `ready`/`config` from the bridge before the
7 s reopen, so a single lost frame cannot cost a whole session.

## 2. Root cause and source references

- `firmware/src/SerialManager.cpp` / `main.cpp`: RX bytes are framed and parsed regardless of host
  presence; the self-echo is stored like a host line.
- `firmware/src/ProtocolParser.cpp` (`handleLine`): `deserializeJson()` was called only at offset 0;
  a prefixed frame was a hard `ParseError`, and `lastPeerSeq_` stayed 0, so `config` was a `Gap`.
- `bridge/src/bridge.ts`: ready/config were sent once; without an ACK the bridge waited 7 s and
  reopened the port, which resets the device — the only recovery observed in the field.
- `firmware/src/main.cpp` (`sendError` path): errors are rate-limited/suppressed before the link is
  ready, which is why the field logs showed no device error.

Why Phase 3.1 "worked": its parser has the same weakness in principle. Its 140-byte hello and its
boot timing lose the race less often than the 164-byte Phase 4 hello; with the esptool amplifier,
**both** images failed 0/10, which proves the defect is not Phase 4-specific. The Phase 4 image was
simply the first to be cold-booted often enough.

## 3. Corrections (local commits)

| Commit | Change |
| --- | --- |
| `a68fc1f` | parser frame resynchronisation (≤4 `{` candidates in the first 192 B, peer type required, counter `framingResyncs()`); RX drain while `!hostConnected()`; host tests |
| `2509de8` | bridge handshake replay every 2 s (max 3, `ready` restarting at seq 1), cleared by the ACK; regression test |

The parser path is unchanged for clean lines: the scan only runs after a deserialization error. A
line with no complete peer frame is still `ParseError` and does not advance the sequence.

## 4. Evidence

- **Mechanism**: minimal transmit-only firmware receives its own line; probe build on 4 physical cold
  boots receives a garbled prefix in front of `ready`, `framing=1`, ACK 1/2 every time.
  `docs/evidence/phase-4-1-usb-diagnostics.md`.
- **A/B**: archived Phase 4 0/10 vs fixed 10/10 under the esptool amplifier; clean software restarts
  10/10 for both Phase 3.1 and Phase 4; bridge-like 15 s absence 5/5 for both candidates.
  `docs/evidence/phase-4-1-ab-matrix.md`.
- **Field reproduction**: real bridge + physical cold boot on the previous candidate → hello,
  ready/config, no ACK, retries 1–2 unanswered, recovery only after the reopen.
  `/tmp/opencode/phase41/final-live2.log`.
- **Final image**: `2ff67b71…`, written and verified at `0x10000`; bridge LIVE, ACK 1/2 on the first
  attempt, 0 device errors, 0 resync, 0 retries, real tokens/MCP/session.
  `docs/evidence/phase-4-1-hardware-validation.md`.

## 5. Build and tests

- Clean release: RAM 22 604 / 327 680 B (6.9 %), flash 376 734 / 1 310 720 B (28.7 %),
  `firmware.bin` 411 232 B, SHA-256 `2ff67b71…`.
- Bridge **103/103** (new: handshake replay), plugin **24/24**, protocol PASS (12 valid / 14
  invalid), firmware host four suites (protocol incl. new prefix cases, localization, gestures, TX),
  preview 8/8. TypeScript typecheck PASS.
- Diagnostic probe `26ebecfa…` and lab builds are archived in `/tmp/opencode/phase41/bin/`; no
  diagnostic image is installed.

## 6. Files touched

Firmware: `src/ProtocolParser.{h,cpp}`, `src/SerialManager.{h,cpp}`, `src/main.cpp`,
`test/host/test_protocol.cpp`.
Bridge: `src/bridge.ts`, `test/bridge.test.ts`.
Docs: this report, `phase-4-1-investigation.md`, the four `evidence/phase-4-1-*.md` files, and the
updates listed in §9.

## 7. Security and constraints

- Local work only; no GitHub operation of any kind.
- No secret, token, prompt, path or hostname added to code, logs or documents.
- The device remains a display/input surface; no permission is approved from the device.
- Backups untouched: full flash `70d918e7…` (4 MiB), Phase 3.1 `280166…`, Phase 4 archive
  `741dcb5b…`, experimental images preserved.
- Wiring, GPIOs, rotation and the Codex Astra design are unchanged.
- Flashes were application-only at `0x10000`, esptool 5.7.0 `--no-stub`, write + independent verify;
  bootloader, partitions and NVS were not rewritten.
- Privacy and allowlists untouched.

## 8. Limitations

1. **NOT COMPLETED**: 20 cold boots, 10 software reboots, 10 bridge restarts and 10 USB reconnects on
   the final image with the production bridge. 4/4 cold boots passed on the probe build P; 10/10
   software restarts passed on the lab build B''; the real-bridge series on D was stopped by the
   owner after one cycle.
2. **NOT RUN**: the 3600 s soak (`docs/evidence/phase-4-1-soak-test.md`).
3. The visual tour (six screens, EN/FR/DE, accents, gestures, preferences) was validated on the
   Phase 4 image and not repeated on D; the 4.1 changes do not touch rendering.
4. The exact silicon/hypervisor origin of the self-echo is not traced; the corrections are defensive
   and do not rely on it. The VMware virtual USB hub is a plausible contributor.
5. `framingResyncs()` is exposed for tests/lab builds, not displayed; production observability of
   this counter is a Phase 5 item.
6. Builds are deterministic for a given tree, but the archived 4.0 binary is not bit-reproducible
   from `c39b1fa` (same size, different hash); this predates Phase 4.1.

## 9. Documentation updates

- `docs/phase-4-1-investigation.md` — hypothesis list, updated with the confirmed mechanism.
- `docs/evidence/phase-4-1-usb-diagnostics.md`, `phase-4-1-ab-matrix.md`,
  `phase-4-1-hardware-validation.md`, `phase-4-1-soak-test.md`.
- `docs/phase-4-report.md` — 4.1 resolution appended, original failure preserved.
- `docs/handover-phase4.md`, `docs/troubleshooting.md`, `docs/roadmap.md`, `AGENTS.md`,
  `CHANGELOG.md`.

## 10. Recommendation

Keep image D installed. Resume with a single acceptance session: 20 cold boots with the production
bridge (the bridge log must show ACK 1/2 on every boot, with `framingResyncs` observable in a probe
build), then the 3600 s soak. Do not start Phase 5 before that; the 8 h endurance and renderer
optimisation remain Phase 5 work.
