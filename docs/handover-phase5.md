# Phase 5 — handover

Date: 2026-11-27. Phase 5 is **not accepted**. Checkpoint B (software) is accepted by the Product
Owner; the hardware blocker is open. This handover records the exact state so the next session can
resume without repeating a flash or losing an image.

## 1. Device and bridge

| Item | State |
| --- | --- |
| Installed firmware | Phase 4.1 `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`, 411 232 B, read-back verified |
| Bridge | **stopped**; the last 4.1 session failed (ready, 0 ACK, retries) after a watchdog reset |
| Port | `/dev/ttyACM0`, ESP32-C3 MAC `44:BD:8D:4E:27:A4` |
| Recovery | a **real power cycle/replug** restores the USB handshake; then start the 4.1 bridge |

Do not start the bridge on a device whose RX is dead: it only loops through resets. Power-cycle
first, then run `cd /tmp/opencode/buddy41/bridge && npm run live -- --log-level debug`.

## 2. Images and backups (outside the build trees)

| Image | SHA-256 | Size |
| --- | --- | --- |
| Phase 4.1 | `2ff67b71…` | 411 232 B |
| RC1 (stable) | `dd7d1d57…` | 413 344 B |
| Full flash before diagnostics | `25c1d7ff…` | 4 194 304 B |
| Diagnostic `3646d4ce` | `3646d4ce…` | 415 408 B |
| Diagnostic `af390f71` | `af390f71…` | 416 704 B |
| Diagnostic `fix3` `3689b828` | `3689b828…` | 416 704 B |
| Diagnostic `fix4` `0b57ca8c` | `0b57ca8c…` | 416 624 B |

Locations: `.backups/phase4-2026-11-26/`, `.backups/phase5-rc-2026-11-27/`,
`.backups/phase5-diag-2026-11-27/`. Rollback uses only `2ff67b71…`; never `741dcb5b…`.

## 3. Software state

- Bridge 126/126, plugin 27/27, coverage 96.61 / 87.31 / 87.63, typecheck and ESLint PASS.
- Protocol 12 valid / 14 invalid; firmware host protocol/localization/gestures/TX/fuzz/numbers PASS.
- Preview 8/8; tick-table check PASS; 288/288 rendered images pixel-identical to the 4.1 reference.
- The unvalidated pre-link/heartbeat and host-byte gate changes were **reverted** (`d564f48`); the
  release source reproduces RC1 code. A fresh build `f9cc72ee…` (413 344 B) is code/data-identical to
  `dd7d1d57…`; only the ELF SHA and image validation hash differ. RC1 `dd7d1d57…` is the stable
  candidate.
- The diagnostic instrumentation is compiled out of the release; the images above are separate.

## 4. Findings

- 4.1 baseline 60 s / 300 s / 900 s before any flash: **3/3 PASS**.
- The authorised diagnostic reproduced the failure: ready/config written, no ACK; device
  `rx_bytes=16`, `rx_lines=0`, `ok=0`, `dropped=26`, `hello=24`, `hb=24`.
- The release 4.1 also failed after a rollback reset without diagnostics; a real power cycle restored
  it. The blocker is real and independent of the instrumentation.
- Diagnostic instrumentation defects (direct printf, no-flush TxBuffer) were found and fixed in the
  diagnostic-only branch; they are not release behaviour.
- `fix3`: `hb=0` but 26 pre-link hellos because `hostConnected()` is enumeration-based; `rx_bytes=16`.
- `fix4`: host-byte gate; `hello=0`, `rx_bytes=0`, bridge “no hello received” — deadlock when RX is
  dead.
- Root cause of the USB RX stall is **not proven**. Workaround: real power cycle/replug.
- Partial hardware renderer sample: Buddy offline 46.6 ms average, p50/p95/p99 46.0 ms; Session/
  Tokens and the six-screen matrix are unmeasured on hardware.

## 5. Next actions

1. Power-cycle/replug; confirm the 4.1 bridge handshake (record the cold boot).
2. Investigate the USB CDC RX reset (peripheral re-init on host edge, DTR/RTS, or a documented
   power-cycle requirement) with a new approved diagnostic image.
3. Only then build/authorise the final RC flash and run the 20 cold boots, 10 reconnects, soak and
   28 800 s endurance.
4. Rebuild the MOCK bench image with the final fix and explicit approval to measure Session/Tokens.

No GitHub operation was performed. The repository is local and clean at the handover commit.
