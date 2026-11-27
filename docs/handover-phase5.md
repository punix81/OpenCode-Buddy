# Phase 5 — handover

Date: 2026-11-27. **Phase 5 is CLOSED: SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED** (Product
Owner decision). The USB blocker is not declared resolved and VMware is not a confirmed root cause.
The Windows-host + VMware Ubuntu USB-redirection environment is not the reference for hardware
acceptance; the hardware gates move to Phase 6 on native physical Windows/Linux. This handover
records the frozen state and the preserved evidence.

## 1. Device and bridge

| Item | State |
| --- | --- |
| Installed firmware | Phase 4.1 `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`, 411 232 B, read-back verified |
| Bridge | **stopped**; no further USB diagnosis in the virtualised environment |
| Device | preserved on the verified 4.1 image; no flash, no physical manipulation |
| Hardware validation | **deferred to Phase 6**, native physical Windows/Linux without USB virtualisation |

Do not run USB diagnostics, handshake experiments, benchmarks, soak/endurance or flashes in the
current VMware/Ubuntu USB-redirection setup. The device stays as preserved; the historical failure
evidence is not deleted and no root cause is claimed.

## 2. Images and backups (outside the build trees)

| Image | SHA-256 | Size |
| --- | --- | --- |
| Phase 4.1 | `2ff67b71…` | 411 232 B |
| RC1 (frozen) | `dd7d1d57…` | 413 344 B |
| RC1 clean rebuild | `f9cc72ee…` | 413 344 B |
| Full flash before first diagnostic | `c58f4cca…` | 4 194 304 B |
| Full flash before fix2 | `25c1d7ff…` | 4 194 304 B |
| Diagnostic `3646d4ce` | `3646d4ce…` | 415 408 B |
| Diagnostic `af390f71` | `af390f71…` | 416 704 B |
| Diagnostic `ad4039ac` | `ad4039ac…` | 416 592 B |
| Diagnostic bench `e4aeb6f9` | `e4aeb6f9…` | 418 000 B |
| Diagnostic `fix3` `3689b828` | `3689b828…` | 416 704 B |
| Diagnostic `fix4` `0b57ca8c` | `0b57ca8c…` | 416 624 B |

Locations: `.backups/phase4-2026-11-26/`, `.backups/phase5-rc-2026-11-27/`,
`.backups/phase5-diag-2026-11-27/`. Full hashes, sizes and the verification command:
`docs/evidence/phase-5-artifacts.md`. Rollback uses only `2ff67b71…`; never `741dcb5b…`.

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

## 5. Next actions — Phase 6 only

1. Start from `docs/phase-6-plan.md`; implementation awaits the next explicit Product Owner
   instruction.
2. Run all hardware validation on a **native physical Windows or Linux** host without USB
   virtualisation: 20 cold boots, 10 USB reconnections, 10 software reboots, 10 bridge restarts,
   six-screen/EN/FR/DE/gesture/preference checks, Session/Tokens timing matrix.
3. Run the 3600 s soak and 28 800 s endurance (MOCK, stable) on the Phase 6 bridge.
4. Package, install/update/uninstall and validate the final product; no functional RC1 change without
   explicit justification and authorisation.
5. Preserve every artifact and failure report listed above; no evidence deletion.

Phase 5 is closed on software; the hardware blocker remains an open Phase 6 risk, not a Phase 5
acceptance failure. No GitHub operation was performed. The repository is local and clean at the
handover commit.
