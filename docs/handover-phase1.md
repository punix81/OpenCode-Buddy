# Phase 1 handover — OpenCode Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy`, branch `main`
Audience: a developer or agent resuming the work without this session's context.

## Status in one paragraph

Phase 0 is approved. Phase 1 firmware is implemented, compiles cleanly, runs on the real board, and
its display, twelve states, gestures, quiet mode and NVS persistence are validated with firmware
telemetry plus human observation. The full 4 MB device backup was taken and verified before flashing,
and the device has been restored to the reference firmware and verified byte for byte. Phase 1 is
closed as **PASS WITH RESERVATIONS**. Phase 2 is planned in `docs/phase-2-plan.md` and has **not**
started; it waits for Product Owner approval.

## Verified facts

| Item | Evidence |
| --- | --- |
| Build | 354 982 B flash (27.1 %), 16 364 B static RAM (5.0 %), image 385 984 B |
| Clean build | 17.59 s, no warnings from Buddy sources |
| Boot | setup → first frame ≈ 324 ms |
| Memory | heap 304 684 → 252 088 B after a 52 596 B canvas; min 251 900; largest block 229 364 |
| Render | average 31.9 ms, maximum 33.1 ms |
| FPS | 25 active, 15 idle, ~8–10 offline (by design) |
| Soak | 902 s, 0 resets, heap flat first→last |
| Software restarts | 5/5, `reset=software`, `unexpected=0` |
| Gestures | short ≈350 ms, long 1980 ms, screens 0/1/2/5 reached, edge count 0→30 |
| Display | human-validated: orientation, colours, readability, no flicker, `MOCK` visible |
| Navigation | human-validated: six screens, double press, quiet, very-long reset, 60 s return |
| Restore | 4 MB written and verified, digest matched; device re-enumerated and the bridge opened the port. Reference UI confirmation pending. |

Detailed evidence: `docs/evidence/phase-1-performance.md`,
`docs/evidence/phase-1-hardware-validation.md`, `docs/evidence/phase-1-rollback.md`.

## Device state

- Restored to the reference Codex Quota Mini firmware from the verified 4 MB dump.
- Reference bridge restarted with its original manual command; it owns `/dev/ttyACM0`.
- The systemd unit `codex-quota-bridge.service` remains stopped and enabled, as it was before the
  session.
- Full backup hash: `9a83841f558517bd9eb4e6c67a0daa483b36fe3ed0e31de3b1e9e0735bd07479`.

## Pending work

1. Phase 2 implementation, after explicit Product Owner approval (see `docs/phase-2-plan.md`).
2. Cold boots: 2 power cycles are kernel-evidenced; 5 were requested. Recorded as a reservation.
3. Optionally attach a photograph of the panel to the hardware evidence.

## GitHub

All remote GitHub operations are handled personally by the Product Owner: pushes, issues, pull
requests and releases. Local commits are expected. Agents must not attempt remote operations or
credential setup (`AGENTS.md` §8). The former blocker B-01 is a Product Owner responsibility and is
not a development blocker.

## Traps discovered during validation

- **Opening `/dev/ttyACM0` resets this board.** It increments the boot counter and clears gesture
  counters. Keep one connection open for an observation window; otherwise working gestures look
  absent.
- **esptool 4.5.1 is unusable here for reads**: the stub re-enumerates USB and the ROM reader fails at
  the 2 MB boundary. esptool 5.7.0 with `--no-stub` reads and writes reliably.
- Only one process may own `/dev/ttyACM0`; check before opening it.
- The PlatformIO registry did not complete behind the proxy. TLS verification stayed enabled; the
  build used a git-ignored local override linking cached LovyanGFX 1.2.21.

## Commits

Local only. Use `git log --oneline` for the current list; the branch is ahead of `origin/main`, which
is expected and is not a blocker.
