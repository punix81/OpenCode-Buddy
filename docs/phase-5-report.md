# Phase 5 — report (Checkpoint B)

Date: 2026-11-27
Status: **Checkpoint B complete; Phase 5 NOT accepted. The 2026-11-27 diagnostic campaign confirmed
a USB CDC RX stall after a watchdog/flash reset; no validated fix. A real power cycle restores the
link. RC1 `dd7d1d57…` remains the stable software candidate; the experimental release `c3468a99…` is
not suitable. No final RC flash.**
The installed firmware is the verified Phase 4.1 release `2ff67b71…`; the bridge is stopped and needs
a power cycle/replug to restore the LIVE handshake. No GitHub operation, no Phase 6.

## 1. Summary

| Area | Result |
| --- | --- |
| Renderer optimization | Implemented; **288/288 rendered images pixel-identical** to 4.1 |
| Numeric tests | `number()` boundaries + existing uint32/wide-token tests PASS |
| OpenCode integration | 3 new projection tests (compaction failure, status discriminator, partial usage); plugin 27/27 |
| Linting | ESLint 10.12 + typescript-eslint 8.71; 6 dead-code issues fixed; QA/gate wired |
| Diagnostic firmware | Built; campaign images installed, verified and rolled back; USB RX stall still open |
| Bridge fix `c4db0b3` | Integrated and tested (126/126); diagnostic filter added; not deployed to the running 4.1 bridge |
| RC firmware | RC1 `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash (stable candidate) |
| Coverage | 96.61 % lines / 87.31 % branches / 87.63 % functions |
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
- Performance: the baseline and the optimization are documented; a **partial ESP32 sample** (Buddy
  offline) measured 46.6 ms average, p50/p95/p99 46.0 ms. Session/Tokens and the six-screen matrix
  remain unmeasured (the MOCK bench image was not flashed). Details:
  `docs/evidence/phase-5-performance.md`.
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
- Coverage: 96.61 / 87.31 / 87.63. Per-module exceptions (server 76 % branch, source 79 %, registry
  82 %) are stateful/IO paths, documented in `phase-5-coverage.md`.

### 3.5 Diagnostic firmware (additional Checkpoint B request)

`firmware/platformio.ini` gains `supermini-diag-live` (LIVE, diagnostics on, MOCK off). Under
`BUDDY_DIAGNOSTICS` it reports framing resyncs, RX bytes/lines/dropped/overflows, parser code counts,
hello/heartbeat, host transitions, the last line code/length/printable head, plus the existing heap,
FPS, render max and TX drops (`BUDDY-DIAG` + `BUDDY-DIAG2` every 5 s). Release build has the counters
compiled out (only the byte/discard counters in `SerialManager`, +16 B RAM).
Artifact: `3646d4ce…`, 415 408 B. It was installed for the 2026-11-27 campaign and rolled back
(`2ff67b71…` verified). The campaign and the corrected images (`af390f71`, `3689b828`, `0b57ca8c`)
are documented in `docs/evidence/phase-5-usb-diagnostics.md`; the USB RX stall is still open.

### 3.6 Release Candidate

`docs/evidence/phase-5-rc.md`: RC1 `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash; bridge main
branch with `c4db0b3` (126/126); plugin 27/27; 288/288 pixel equivalence. The 2026-11-27 diagnostic
campaign did **not** produce a validated USB fix; the experimental `c3468a99…` host-byte gate
deadlocks when RX is dead. **The 4.1 soak on `58bd386` does not validate this bridge**; a new soak
remains required.

## 4. Differences vs the Phase 4.1 reference

See `phase-5-rc.md` §5. In short: renderer internals (pixel-identical), `Format.cpp`, SerialManager
byte counters, diagnostic env; bridge P1/P2 fixes + the both-ACK requirement. Protocol, UI,
preferences and gestures unchanged.

## 5. Gates remaining before Phase 5 acceptance

1. **Power-cycle/replug the device** to restore the 4.1 LIVE handshake (the RX stall after a
   watchdog/flash reset leaves it dead).
2. Establish and fix the USB CDC RX stall root cause (peripheral vs HWCDC vs host CDC state); the
   pre-link backlog is only an aggravating factor. Do not ship the host-byte gate.
3. Explicit flash authorisation for the final RC, then 20 genuine cold boots and 10 USB
   reconnections on that image.
4. 3600 s soak on the RC bridge (not the 4.1 one) and the 28 800 s endurance.
5. Six-screen/EN/FR/DE/gesture/preference confirmation and the full hardware renderer matrix
   (Session/Tokens p50/p95/p99); the MOCK bench image is not yet authorised/flashed.
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


## 8. Diagnostic campaign (2026-11-27)

Full counters and images: `docs/evidence/phase-5-usb-diagnostics.md`.

- 4.1 baseline before any flash: 60 s / 300 s / 900 s **3/3 PASS**, 0 retry, 0 invalid, 0 reconnect.
- Authorised `3646d4ce…`: flash verified; first opening failed (ready, 0 ACK, 3 retries) with
  `rx_bytes=16`, `rx_lines=0`, `dropped=26`, `hello=24`, `hb=24`; direct `Serial.printf` was an
  instrumentation confounder.
- 4.1 after rollback: first two sessions failed, then recovered after idle; a real power cycle
  (USB device 22) restored the handshake.
- `fix3` `3689b828…`: heartbeat suppressed (`hb=0`) but 26 pre-link hellos (`hostConnected` is true
  after enumeration), `rx_bytes=16`, no ACK.
- `fix4` `0b57ca8c…`: host-byte hello gate; `hello=0`, `rx_bytes=0`, bridge “no hello received” —
  deadlock when RX is dead.
- The RX stall is **not root-caused**. Workaround: real power cycle. The experimental USB policy
  was reverted (`d564f48`); the release source reproduces RC1 code (fresh build `f9cc72ee…`, 0
  code/data differences vs `dd7d1d57…`). RC1 `dd7d1d57…` remains the stable candidate.
- Partial hardware renderer sample: Buddy offline 46.6 ms average, p50/p95/p99 46.0 ms; Session/
  Tokens and the six-screen matrix remain unmeasured on hardware.

## 9. Local commits added during the campaign

- `7fd9f1f` — ignore BUDDY-DIAG telemetry in the bridge
- `d5d5bc9` — safe-integer token tests
- `6cb4859` — tick-table check in QA
- `680e05f` — diagnostic instrumentation (histogram, bench commands)
- `fa17f45` — firmware uint32 overflow tests
- `11296e9` — diagnostic TxBuffer (no protocol interleave)
- `45d9be9` — pre-link heartbeat suppression
- `7b8357a` — bench probe and log analyser
- `cbd9d92` — 288-image equivalence tool
- `031a9c3` — host-byte hello gate (experimental; not suitable)
- `d564f48` — revert of the unvalidated USB hello policy; release code returns to RC1
