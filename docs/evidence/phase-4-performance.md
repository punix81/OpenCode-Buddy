# Phase 4 — performance evidence

Date: 2026-11-26
Status: **PARTIALLY VERIFIED** — measured on the Phase 4 diagnostic image; the release image has no
diagnostic channel. The Phase 4 release was later removed for the USB blocker; Phase 3.1 is installed.

## 1. Method

- Image: `[env:supermini-diag]` built from the Phase 4 source with `BUDDY_MOCK_MODE=1`,
  `BUDDY_DIAGNOSTICS=1` and bench commands (`BUDDY-LANG`, `BUDDY-SCREEN`, `BUDDY-QUIET`).
- sha256 `bdaac7733e40c3a1e525ebd8f842edc079bfeb1daa1f1a2ba0645497fc60c9b1`, 413 392 B,
  22 636 B RAM / 378 666 B flash.
- Flashed application-only at `0x10000` with esptool 5.7.0 `--no-stub`; verified; MOCK only, no
  bridge. Diagnostic `BUDDY-DIAG` lines were parsed from the USB CDC stream; production NDJSON was
  not mixed with the diagnostic collection (no bridge).
- 45 periodic samples: each screen in EN/FR/DE for 11 s, plus quiet English Buddy/Session. The last
  stable 5 s sample of each group is reported; the diagnostic resets its counters every 5 s.
- The exact release image was preserved before the diagnostic flash and reflashed/verified after
  (`741dcb5b…`). The diagnostic image is not installed.

## 2. Results (last stable sample per group)

| Language / screen | State | FPS | Render avg | Render max |
| --- | --- | --- | --- | --- |
| EN Buddy | 5 (permission) | 20 | 48.2 ms | 48.6 ms |
| EN Session | 8 (error) | 8 | 100.1 ms | 100.2 ms |
| EN Tokens | 1 (idle) | 8 | 89.3 ms | 89.4 ms |
| EN Tools | 4 (working) | 8 | 32.7 ms | 32.8 ms |
| EN MCP | 6 (input) | 8 | 32.9 ms | 33.0 ms |
| EN System | 9 (compacting) | 8 | 33.1 ms | 33.3 ms |
| FR Buddy | 0 (offline) | 15 | 47.4 ms | 47.9 ms |
| FR Session | 4 | 8 | 100.2 ms | 100.4 ms |
| FR Tokens | 6 | 8 | 90.1 ms | 90.2 ms |
| FR Tools | 9 | 8 | 33.1 ms | 33.2 ms |
| FR MCP | 1 | 8 | 33.0 ms | 33.1 ms |
| FR System | 3 | 8 | 33.5 ms | 33.6 ms |
| DE Buddy | 6 | 20 | 48.2 ms | 48.6 ms |
| DE Session | 10 | 8 | 100.2 ms | 100.3 ms |
| DE Tokens | 1 | 8 | 89.7 ms | 89.8 ms |
| DE Tools | 4 | 8 | 33.3 ms | 33.3 ms |
| DE MCP | 7 | 8 | 33.2 ms | 33.3 ms |
| DE System | 10 | 8 | 33.3 ms | 33.4 ms |
| Quiet EN Buddy | 1 | 4 | 47.7 ms | 47.9 ms |
| Quiet EN Session | 4 | 2 | 100.5 ms | 100.5 ms |

Memory and link:

| Metric | Value |
| --- | --- |
| heap | 245 636–245 780 B (field minimum 245 396 B) |
| largest free block | **225 268 B constant** |
| `dropped` / TX drops | **0** |
| `txfree` minimum | 256 B |
| boot / reset | `boot=1`, `reset=poweron` throughout; no unexpected reset |
| `maxframe` (diagnostic protocol) | 164 B (hello with caps) |

## 3. Interpretation

- **Buddy active**: 47–48 ms, 20 FPS. This matches the Phase 3.1 reference (47.2 ms avg / 48.1 ms max)
  and is the pane that receives the animation.
- **Dashboards**: Tools, MCP and System are ~33 ms / 8 FPS, comfortably within the 50 ms target.
  Session and Tokens are **~90–100 ms / 8 FPS**, above the 50 ms target. The 24 pt metric number
  (`FreeSansBold24pt7b`) plus the surrounding arcs is the dominant cost; the extra localization text
  is not. This is a Phase 5 rendering-optimization item, not a Phase 4 blocker.
- **FPS 8** on dashboards is the intentional 120 ms dashboard cadence, not a rendering stall.
- **Quiet**: Buddy 4 FPS and Session 2 FPS are the deliberately reduced quiet cadence; the render
  time itself is unchanged. Quiet is not a performance regression.
- **Memory**: heap is within 176 B of the Phase 3.1 reference; the largest block is identical
  (225 268 B). No leak or fragmentation trend across 45 samples. The diagnostic build has extra
  code/bench commands; the release has 22 604 B static RAM.
- **No TX drops** and one boot in the whole capture.

## 4. Limits

- The diagnostic image is MOCK and larger than the release; the absolute frame times may differ
  slightly from the release. The release does not expose heap/FPS by design.
- The performance capture was done **before** the Phase 4 USB blocker was isolated; the Phase 4
  release image itself did not handshake reliably on subsequent boots. Performance is therefore
  evidence for the renderer, not for release USB stability.
- One-hour/8-hour soak and full rendering optimization remain Phase 5.

## 5. Phase 5 actions

1. Profile the 24 pt metric text and the 28 token arcs; target ≤50 ms on Session/Tokens.
2. Repeat the capture on the final Phase 4 release if it is ever accepted, with the same bench
   commands and a clean release artifact.
3. Run the mandatory one-hour final-bridge soak and the 8-hour hardware run.
