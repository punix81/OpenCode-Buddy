# Handover — after Phase 4 hardware validation

Date: 2026-11-26
Final local commit: `1b43a6a` (documentation commit follows).
Device: **Phase 3.1 release** `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad`
installed and verified. Bridge: LIVE with the Phase 4 bridge code.

## 1. Outcome

Phase 4 software is complete and its UI/localization/preferences were physically reviewed, but the
Phase 4 release image **failed the USB CDC RX gate**: on multiple cold boots it sent `hello` and
heartbeats but never ACKed `ready`/`config`. The same host, cable, bridge and procedure with Phase 3.1
handshakes immediately. The Phase 4 image was removed; Phase 3.1 was restored. Do not claim Phase 4
hardware acceptance.

Evidence:

- `docs/evidence/phase-4-hardware-validation.md`
- `docs/evidence/phase-4-performance.md`
- `docs/evidence/phase-4-test-summary.md`

## 2. Preserved artifacts

`.backups/phase4-2026-11-26/`:

- `full-flash-pre-phase4.bin` (4 MiB, sha256 `70d918e7…9011`).
- `app-phase31-installed.bin` (matches `280166…e12ad`).
- `firmware-phase4-release.bin` / `firmware-phase4-release-741dcb5b.bin` (410 656 B,
  `741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e`).
- `firmware-phase4-release-848b3a99.bin` (experimental host-gated announcements, 410 736 B).
- `firmware-phase4-diag.bin` (MOCK/diagnostics/bench, 413 392 B,
  `bdaac773…c9b1`).

The Phase 3.1 backups under `.backups/phase31-2026-11-26/` are untouched.

## 3. Phase 5 USB isolation plan (priority)

The failure is firmware-side or a Phase 4 boot/USB interaction, not the host/cable/bridge (Phase 3.1
control works). Do not retry Phase 4 acceptance before isolating:

1. Build a minimal A/B pair from the Phase 3.1 firmware:
   - A: Phase 3.1 hello (140 B).
   - B: same firmware with a 24-byte longer hello (the Phase 4 capability) and no other change.
   Flash each, cold-boot five times, start the bridge, and record ACK/no-ACK. This tests the hello
   size / packet-boundary hypothesis.
2. If B fails and A passes, shorten or defer the capability: send `state.opencodeVersion` in a
   separate frame, use a 1–3 character capability token, or negotiate it after the handshake.
3. If both pass, add the Phase 4 dashboard rendering and boot screen to B, one change at a time,
   until the failure reproduces (boot render time, NVS last screen, auto-return, localization).
4. Test the no-host backlog deliberately: leave the device powered without a host for 0/10/30/60 s,
   then open the bridge. The current bridge drains the backlog (2.5 s settle) and primes the endpoint;
   the device still failed, so measure whether the Phase 4 TX backlog wedges the CDC RX.
5. Add a firmware recovery only if it is safe: a bounded no-host announcement policy or a supervised
   USB re-init. Do not loop USB re-enumeration on a healthy link.
6. Only after a stable A/B, retry the Phase 4 UI validation and the final one-hour soak.

## 4. Current bridge changes to keep

`1b43a6a` adds: link settle drain (2.5 s), blank prime, 1 s handshake delay, no-ACK reopen, duplicate
heartbeat no-ACK, ready resend on handshake resync, V02 individual-token overflow handling and V04
multi-peer version agreement. These are tested 102/102 and improve Phase 3.1 operation. Do not revert
them while debugging the Phase 4 image; they are the control condition.

## 5. Known traps

- Opening the CDC port can reset the ESP32-C3; never reopen per message.
- The USB port is single-owner. Stop the bridge before esptool or a manual probe.
- After some esptool resets the CDC RX stays mute; a physical power cycle is the only reliable
  recovery observed. The bridge cannot revive it.
- The Phase 4 diagnostic build is MOCK-only; its `BUDDY-DIAG` lines are not a release diagnostic
  channel. Bench commands were compiled only in the temporary diag env and are not in the release
  source.
- Do not change GPIOs, rotation, USB architecture, privacy or the Codex Astra design.
- Do not use GitHub; §8 of `AGENTS.md` applies.

## 6. Commands

```sh
cd bridge && npm run typecheck
cd bridge && npx tsx --test test/*.test.ts
cd bridge && npm run test:plugin
cd bridge && npm run validate:protocol
bash firmware/test/host/run.sh
cd tools/ui-preview && python3 -m unittest -q test_preview.py
cd firmware && ../.venv/bin/pio run -e supermini
```

Never run `opencode service restart` while an agent session is active. Stop the bridge with a normal
signal; do not delete a live lock/socket/token.
