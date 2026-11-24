# Phase 1 handover — OpenCode Buddy

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy`, branch `main`
Audience: a developer or agent resuming the work without this session's context.

## Status in one paragraph

Phase 0 is approved. Phase 1 firmware is implemented, compiles cleanly, runs on the real board, and
its display, twelve states, gestures, quiet mode and NVS persistence are validated with a combination
of firmware telemetry and human observation. The full 4 MB device backup was taken and verified
before flashing. At the time of writing, the device still runs Buddy and the reference firmware has
not yet been restored; the restore script and image are ready.

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

Detailed evidence: `docs/evidence/phase-1-performance.md` and
`docs/evidence/phase-1-hardware-validation.md`.

## Device state and rollback

- Buddy application is flashed at `0x10000`; bootloader, partition table, otadata and NVS were not
  rewritten.
- Full backup: 4 194 304 bytes, SHA-256 `9a83841f558517bd9eb4e6c67a0daa483b36fe3ed0e31de3b1e9e0735bd07479`.
- The bootloader, partition table and application regions of the dump match the reference build
  artefacts byte for byte, and the lower 2 MB match an independent 64 KB block read.
- Restore: `.backups/phase1-2026-11-24/restore.sh` (git-ignored) writes the whole dump at `0x0` and
  verifies it.
- The reference bridge was stopped: a manual `bridge.py` instance and the user service
  `codex-quota-bridge.service`. Both start commands are documented in the session report.

## Pending work

1. Run the restore, verify the reference image, restart the bridge, confirm the reference screen.
2. Cold boots: 2 power cycles are kernel-evidenced; 5 were requested.
3. Write the final Phase 1 verdict (expected: PASS WITH RESERVATIONS).
4. GitHub: commits are local only. No credential is configured. The SSH key is not registered on the
   account; the GitHub MCP OAuth path cannot reach GitHub. The seven issue bodies are ready under
   `.github/issues/` and `scripts/create-issues.sh` is idempotent.

## Traps discovered during validation

- **Opening `/dev/ttyACM0` resets this board.** It increments the boot counter and clears gesture
  counters. Keep one connection open for an observation window; otherwise working gestures look
  absent.
- **esptool 4.5.1 is unusable here for reads**: the stub re-enumerates USB and the ROM reader fails at
  the 2 MB boundary. esptool 5.7.0 with `--no-stub` reads and writes reliably.
- Only one process may own `/dev/ttyACM0`; check before opening it.
- The PlatformIO registry did not complete behind the proxy. TLS verification stayed enabled; the
  build used a git-ignored local override linking cached LovyanGFX 1.2.21.

## Commits (local, unpushed)

```
109a75f docs: add Phase 1 hardware validation evidence
870b77d docs: record Phase 1 performance measurements
6904717 docs: record that opening the CDC port resets the board
7c4b4f6 feat(firmware): allow active-low touch input behind a build flag
0111f28 feat(firmware): expose raw touch level and edge count in diagnostics
1dff2f1 feat(firmware): keep boot metrics retrievable after boot
c6aa02d feat(firmware): add Phase 1 validation instrumentation
c5d3828 feat(firmware): implement Phase 1 companion, gestures and screens
```

`origin/main` is still at `c6cb443`; the branch is ten commits ahead and must not be force-pushed.
