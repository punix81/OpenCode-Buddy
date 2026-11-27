# Phase 5 — report (Checkpoint B)

Date: 2026-11-27
Status: **Checkpoint B complete; Release Candidate built, not flashed; Phase 5 not yet accepted.**
The installed firmware remains the Phase 4.1 release `2ff67b71…` and the LIVE bridge remains the 4.1
worktree `58bd386`, as instructed. No physical manipulation, no GitHub operation, no Phase 6.

## 1. Summary

| Area | Result |
| --- | --- |
| Renderer optimization | Implemented; **288/288 rendered images pixel-identical** to 4.1 |
| Numeric tests | `number()` boundaries + existing uint32/wide-token tests PASS |
| OpenCode integration | 3 new projection tests (compaction failure, status discriminator, partial usage); plugin 27/27 |
| Linting | ESLint 10.12 + typescript-eslint 8.71; 6 dead-code issues fixed; QA/gate wired |
| Diagnostic firmware | `supermini-diag-live` built with USB boot-window counters; not installed |
| Bridge fix `c4db0b3` | Integrated and tested (124/124); not deployed to the running 4.1 bridge |
| RC firmware | `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash |
| Coverage | 96.54 % lines / 87.20 % branches / 87.63 % functions |
| Hardware gates | Cold boots, USB reconnections, new-bridge soak and 8 h endurance remain |

## 2. Checkpoint A recap

- Audit: 15 findings, no P0; P1-01 (framer overflow) fixed in `bb5c527`; P2-01/02/03/06/07/08 fixed in
  `99de977`/`aac8a35`; P2-04/05 (rendering) were open at Checkpoint A and are fixed in
  Checkpoint B; the P3 items remain tracked.
- Security: threat model, privacy and security review written; IPC token/permissions/lock verified;
  advisory status **NOT VERIFIED** (registry audit endpoint requires authentication).
- Dependencies/licenses/SBOM/build reproducibility documented; local CI workflow prepared (not run
  remotely).
- 4.1 final acceptance: installed image verified, 10/10 software resets, 10/10 bridge restarts,
  delayed start PASS, 3600 s soak PASS; **20 cold boots and 10 USB reconnections skipped by the
  Product Owner** (documented reservation).

## 3. Checkpoint B deliverables

### 3.1 Renderer (P5-02)

- `tools/ui-preview/gen_ticks.cpp` renders every Session (36) and Tokens (28) tick with the **same
  pinned `fillArc`** and emits `firmware/src/TickTables.h` (160 + 312 horizontal spans). The
  dashboards draw the spans; the face arcs keep `fillArc`.
- `measure()` uses one `textWidth()` for ASCII; composed accents keep the per-codepoint path.
  Truncation uses a binary search over codepoint boundaries instead of the O(n²) loop.
- `number()` moved to `Format.cpp` (LovyanGFX-free) with host boundary tests.
- Equivalence: 288 native preview images, **0 differing pixels**; the review sheets regenerate
  byte-identically. Details: `docs/evidence/phase-5-renderer-equivalence.md`.
- Performance: the baseline and the expected gain are documented; **the ESP32 timing is not measured**
  (no flash). Details and measurement plan: `docs/evidence/phase-5-performance.md`.
- Budget: +2 048 B flash, +16 B RAM versus 4.1; no SPI/palette/font/layout change.

### 3.2 Numeric limits (P5-06)

`firmware/test/host/test_number.cpp` covers 0, 1, 999, 1000, 1049/1050, 1499, 18 400, 949 999/
950 000, 999 949/999 950, 999 999, 1 000 000, 4 300 000, uint32 max, 8 589 934 590, 999 999 999 999
and unknown (19 cases). The existing V02 wide-token tests
and the protocol boundary vectors remain green.

### 3.3 OpenCode integration (P5-05)

Three projector tests added: `session.compaction.failed` → `compaction.ended`; `session.status` maps
only the retry discriminator; `session.usage.updated` without counters is dropped and partial tokens
keep only the present fields. Plugin suite: **27/27**. The live event API remains the one verified in
Phase 3/4; no event or field was invented.

### 3.4 Lint and quality gates (P5-07)

- ESLint 10.12.0 + typescript-eslint 8.71.0 (dev, MIT, pinned), flat config in `bridge/` and a
  plain-JS config in `plugin/opencode-buddy/`. `bridge/.npmrc` keeps registry-specific `resolved`
  URLs out of the lockfile, so no internal hostname is committed.
- Six dead-code findings fixed (unused imports, `optionalInteger`, `nullableClamp`, `locationOf`,
  `catch (error)`, empty interface → type alias).
- `scripts/lint.sh`; `scripts/qa.sh` runs lint, typecheck, bridge, plugin, protocol, host (fuzz +
  number), preview. CI workflow updated (not executed remotely).
- Coverage: 96.54 / 87.20 / 87.63. Per-module exceptions (server 76 % branch, source 79 %, registry
  82 %) are stateful/IO paths, documented in `phase-5-coverage.md`.

### 3.5 Diagnostic firmware (additional Checkpoint B request)

`firmware/platformio.ini` gains `supermini-diag-live` (LIVE, diagnostics on, MOCK off). Under
`BUDDY_DIAGNOSTICS` it reports framing resyncs, RX bytes/lines/dropped/overflows, parser code counts,
hello/heartbeat, host transitions, the last line code/length/printable head, plus the existing heap,
FPS, render max and TX drops (`BUDDY-DIAG` + `BUDDY-DIAG2` every 5 s). Release build has the counters
compiled out (only the byte/discard counters in `SerialManager`, +16 B RAM).
Artifact: `3646d4ce…`, 415 408 B. **Not installed.**

### 3.6 Release Candidate

`docs/evidence/phase-5-rc.md`: firmware `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash;
bridge main branch with `c4db0b3` (124/124); plugin 27/27; 288/288 pixel equivalence; flash/rollback
procedure. **The 4.1 soak on `58bd386` does not validate this bridge**; a new soak is required.

## 4. Differences vs the Phase 4.1 reference

See `phase-5-rc.md` §5. In short: renderer internals (pixel-identical), `Format.cpp`, SerialManager
byte counters, diagnostic env; bridge P1/P2 fixes + the both-ACK requirement. Protocol, UI,
preferences and gestures unchanged.

## 5. Gates remaining before Phase 5 acceptance

1. Explicit flash authorisation for the RC.
2. 20 genuine cold boots and 10 USB reconnections on the RC.
3. Isolate the long-idle first-open handshake with the diagnostic LIVE image; no unexplained failure.
4. 3600 s soak on the RC bridge (not the 4.1 one) and the 28 800 s endurance.
5. Physical six-screen/EN/FR/DE/gesture/preference confirmation and hardware render timings.
6. Windows named pipes and packaging remain Phase 6.

## 6. Constraints respected

No flash, no physical manipulation, no wiring change, no GitHub operation, no Phase 6. The installed
firmware `2ff67b71…` and the LIVE 4.1 bridge were left untouched. All work is local and reversible.

## 7. Local commits

- `f92150d` — `perf(firmware): draw ticks from exact precomputed spans`
- `63e6f9c` — `feat(firmware): add a LIVE diagnostic image for the USB boot window`
- `35005b5` — `chore: add the local lint gate and remove dead code`
- `f135919` — `test(plugin): cover compaction failure, status retry and partial usage`
- the documentation commit that adds this report and the Phase 5 evidence files

No remote operation: the repository has no publication step performed by an agent (Product Owner
responsibility).
