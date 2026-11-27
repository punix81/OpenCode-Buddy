# Phase 5 — repository audit

Date: 2026-11-27 (baseline `36cf097`, firmware `2ff67b71…`)
Scope: firmware, OpenCode plugin, bridge (IPC, protocol, state, metrics, privacy, transport),
simulator, preview, configuration, scripts, tests, documentation.
Method: fresh read of the code paths listed below, targeted executions for the reproducible findings,
and the Phase 4.1 evidence. No finding is included without a file/line reference and an impact.

Severity: **P0** critical security/data integrity, **P1** important reliability/correctness,
**P2** maintainability/performance, **P3** minor improvement. Every disposition is tracked in
`docs/phase-5-report.md`; a finding is only closed when its regression test exists.

## Summary

| Id | Severity | Area | Status |
| --- | --- | --- | --- |
| P1-01 | P1 | bridge protocol framer | **fixed** `bb5c527` |
| P2-01 | P2 | bridge session registry | **fixed** `99de977` |
| P2-02 | P2 | bridge live input timestamps | **fixed** `99de977` |
| P2-03 | P2 | protocol string limits (chars vs bytes) | **fixed** `99de977` |
| P2-04 | P2 | rendering arc cost | confirmed by source + baseline |
| P2-05 | P2 | text measurement cost | confirmed by source |
| P2-06 | P2 | plugin snapshot latency | **fixed** `aac8a35` |
| P2-07 | P2 | MCP totals consistency (normalizer) | **fixed** `99de977` |
| P2-08 | P2 | running session evicted first | **fixed** `99de977` |
| P3-01 | P3 | MCP unknown presented as 0/0 | confirmed |
| P3-02 | P3 | hello drop not retried immediately | confirmed |
| P3-03 | P3 | no lint/format/coverage/QA entry point | QA + coverage done; lint open |
| P3-04 | P3 | performance evidence not reproducible from the repo | confirmed |
| P3-05 | P3 | alias truncation collisions with real names | confirmed (opt-in) |
| P3-06 | P3 | documentation/test-count drift after 4.1 | confirmed, fixed by this phase |

No P0 was found. The IPC trust boundary (0700 directory, 0600 socket/token, 256-bit token,
constant-time compare, lock, ownership and symlink checks, bounded rate and line size) is sound.

---

## P1-01 — Oversized-line counter is cumulative, so the bridge floods the device with errors

**Files**: `bridge/src/protocol/codec.ts:24,45,57,60`; `bridge/src/bridge.ts:310`.

**Evidence (reproduced)**:

```
push1 overflows= 1 push2 overflows= 1 lines= 1 push3 overflows= 1
takeOverflows= 1 after= 0
```

`LineFramer.overflows` is never reset by `push()`; `takeOverflows()` exists but is unused.
`Bridge.onData` checks `framed.overflows > 0` on every chunk.

**Impact**: after a single line longer than 2048 B (a corrupted boot frame is exactly the Phase 4.1
scenario), every following chunk logs "oversized line discarded" and sends `E_TOO_LONG`. During a
burst this is an error storm into a 1024-byte device RX queue; it can produce E_PARSE/resync, the
class of failure Phase 4.1 fixed. It also inflates the ACK/keep-alive traffic and hides the real
event rate.

**Reproduction**: feed one 3000-byte line, then N valid frames; count `error` frames. Today N errors
are sent.

**Fix**: consume the counter once per `onData` (`const overflows = this.framer.takeOverflows()`), or
make `overflows` per-push. Keep one cumulative getter only for diagnostics.

**Regression tests**: framer: a second push reports 0; bridge: after an oversized line, 10 valid
frames produce exactly one `E_TOO_LONG` (pre-handshake suppression keeps it at 0 until ready).

## P2-01 — Registry can exceed its session cap when prompts are pending

**Files**: `bridge/src/state/registry.ts:229-237`.

`prune()` removes only sessions without pending permissions/questions. If every session has a
pending prompt, nothing is removed and `ensure()` keeps adding. A buggy or malicious local peer can
therefore grow the map without bound (each session also holds up to 128 interaction IDs), and the
once-per-second snapshot becomes O(n).

**Fix**: a hard ceiling (for example 256): above it, evict the oldest pending session too (closing it
explicitly) or refuse new sessions until a prompt resolves. Document the eviction. Add a unit test
with 300 sessions and pending prompts.

## P2-02 — Plugin event timestamps are unbounded

**Files**: `bridge/src/normalize/normalizer.ts:77`; `bridge/src/state/registry.ts:66-69,225`.

`at` accepts any integer up to `Number.MAX_SAFE_INTEGER`. The registry uses it for ordering and TTL.
A future timestamp freezes a session (never pruned) and blocks later events (`event.at < reference`);
a past timestamp silently drops live events.

**Fix**: clamp plugin-provided timestamps at the `LiveSource` boundary to `now ± 5 min` (keep
`normalizeEvent` deterministic for tests), log a bounded warning counter. Add tests for future and
past `at` through `LiveSource`.

## P2-03 — Documented string limits are characters; the firmware enforces bytes

**Files**: `bridge/src/protocol/validator.ts:str()`; `bridge/src/privacy/privacy.ts:3-11`;
`firmware/src/ProtocolParser.cpp` (`readString`, model 41 B, agent 25 B, alias 13 B);
`protocol/protocol-v1.md:340-341` ("40 chars", "24 chars").

A 40-character emoji/4-byte model is 160 UTF-8 bytes. The bridge validator accepts it, the firmware
rejects the whole `state` frame with `E_BOUNDS`, and the device loses that snapshot (status, tokens,
tools). The firmware also only composes Latin-1 accents; emoji cannot render.

**Fix**: bound display strings by UTF-8 bytes (`Buffer.byteLength`) and restrict them to printable
Latin-1 (replacement or rejection, documented); update the schema/spec to "bytes" and add a
boundary vector at 40/24/12 bytes plus a 4-byte code point case.

## P2-04 — Rendering: one `fillArc` per animation tick dominates Session and Tokens

**Files**: `firmware/src/Dashboard.cpp:29-32` (36 arcs), `:51-55` (28 arcs);
`firmware/src/Theme.cpp:268-272`; LovyanGFX `LGFXBase::fillEllipseArc` (row scan of the full radius
bounding box with float slope tests per pixel).

Phase 4 measured Buddy 47–48 ms (2 arcs) and Session/Tokens 89–100 ms (36/28 arcs) on the same
panel, same frame push. The push of the 220×220×16-bit sprite is ~29 ms at 27 MHz, so the arc work
accounts for most of the ~50–70 ms of render time. Each `fillArc` scans up to 2r rows and the row
width even for a 2° tick.

**Fix (planned)**: replace `ui::arc()` with a bounded polyline/segment primitive for thin, short arcs
(the tick marks are 2–7°), keeping the palette, radii, angles and thickness. The long Buddy-face arcs
use the same primitive with a 2–3° step. Measure on hardware with a diagnostic build after approval;
do not change the SPI clock. Keep a visual before/after contact sheet.

## P2-05 — Text measurement is per character and the truncation loop is O(n²)

**Files**: `firmware/src/Theme.cpp:117-129` (`measure` calls `textWidth` per codepoint),
`:235-260` (`text` measures twice, then removes one codepoint and re-measures the whole string).

Strings are short (numbers, labels, model/agent), but the identity line is measured on every frame
of Buddy and Session; a long model/agent that does not fit runs the truncation loop dozens of times,
each with a full re-measure. This is the second rendering cost after the arcs.

**Fix (planned)**: measure ASCII strings with one `textWidth(value)` call; keep the per-codepoint path
only for composed accents. Add a small bounded width cache keyed by (font level, string) for repeated
labels; truncate by binary search on codepoint boundaries. No visual change.

## P2-06 — Plugin snapshot can delay live state for up to ~27 s

**Files**: `plugin/opencode-buddy/index.js:238-313`.

`takeSnapshot` awaits the session list, the MCP list and then up to eight permission lists
sequentially, each with a 3 s timeout, while `snapshotPending` queues every live event (max 500). A
slow or hung API after a bridge restart can delay the first useful state by tens of seconds and drop
events at the queue cap.

**Fix**: run the permission lists with `Promise.allSettled` under one global snapshot deadline
(≤ 6 s), and flush whatever succeeded. Add a test with a fake slow API (bounded by the deadline).

## P2-07 — `mcp.status` accepts `online > total`

**Files**: `bridge/src/normalize/normalizer.ts:164-180`.

The plugin path (`IPC normalizeMcpStatus`) validates consistency; the generic normalizer used by the
simulator/mock does not. An inconsistent pair can reach the radar.

**Fix**: require `online <= total <= 255` and `servers.length <= total`; add a mock-path test.

## P2-08 — A running session is evicted before a finished one

**Files**: `bridge/src/live/source.ts:246-250`.

```ts
const victim = [...sessions].find((id) => !this.terminal.has(id)) ?? sessions.values().next().value;
```

The comment says "prefer evicting an already finished session", but `!terminal.has(id)` selects a
**non-terminal** (running) session. With more than 64 sessions for one peer, the focus can be closed
while finished sessions stay.

**Fix**: `find((id) => this.terminal.has(id))` and keep the oldest fallback; add a 65-session test.

## P3-01 — MCP unknown is rendered as 0/0

`registry.mcpStatus()` returns `{online:0,total:0}` when nothing is known; `reduceState` therefore
always sends `mcp`. The device cannot distinguish "no MCP servers" from "unknown". The protocol has
no null pair, but omitting the field/frame would leave the firmware's `known` flag false (`--`).
Decide and document; keep the offline source caption.

## P3-02 — A dropped boot hello waits for the 3 s re-announcement

`sendHello()` ignores `FrameWriter::send`'s `SendResult`. When the TX ring is transiently too small it
is dropped and retried only by the periodic timer. The bridge's handshake replay now covers it, but
an immediate retry on `DroppedNoSpace/DroppedPartial` would shorten the boot time. Low risk.

## P3-03 — No lint, format, coverage or single QA entry point

No ESLint/Prettier configuration; no coverage tool; suites are run by hand (`npm test`,
`firmware/test/host/run.sh`, preview). P5-07 adds `scripts/qa.sh`; coverage is measured with Node's
built-in coverage (`--experimental-test-coverage`) rather than adding a heavy dependency.

## P3-04 — Performance evidence is not reproducible from the repository

The Phase 4 measurements came from a transient diagnostic image under `/tmp` (lost on restart). The
repo has previews but no benchmark build/target. P5-02 adds a documented diagnostic target and a
repeatable procedure; the release image remains free of counters.

## P3-05 — Real MCP names are truncated to 12 bytes and can collide

`privacy.cleanText(server.alias, 12)` with `allowRealMcpNames: true` truncates longer names, so two
servers can share an alias. The default is false (aliases `MCP-n`). Document the limitation; keep the
opt-in explicit.

## P3-06 — Documentation drift after 4.1

The roadmap/handover README referenced "102/102" and "Phase 4 FAIL" in places after 4.1. Fixed by the
Phase 4.1 commit and this phase's doc pass. Test counts are asserted in one place going forward
(`scripts/qa.sh` output and the report), not copied into several documents.

---

## Architecture assessment

- **Boundaries** are clear: plugin (projection + transport) / bridge (validation, state, privacy) /
  firmware (render + protocol). No circular dependencies; the plugin is dependency-free; the bridge
  has one runtime dependency (serialport).
- **Event flow** is single-writer (IpcServer → LiveSource → registry → reducer → privacy → frame).
  The only cross-cutting state is the session map, which is bounded except for P2-01.
- **Resource ownership** is explicit: the bridge owns the port and the runtime dir; the plugin owns
  its socket; the device owns its preferences and display.
- **Error handling** is explicit at the boundaries; pre-handshake errors are suppressed on purpose
  (documented). No silent fallback to mock.
- **Duplication** is low; the IPC path rule is intentionally duplicated (dependency-free plugin) and
  covered by a test (`ipc.test.ts`), which is the right trade-off.
- **Test reliability**: 103 bridge, 24 plugin, 8 preview, 4 host suites; the suites are deterministic,
  no network, no real device. Gaps: fuzzing (P5-04), coverage report (P5-07), lint (P3-03).
- **Documentation**: extensive; the risk is drift, addressed by P3-06.

## Audit limits

- The installed firmware was not re-flashed during the audit; renderer findings rest on the Phase 4
  measurements and the LovyanGFX source, not on a new hardware measurement (no flash approval).
- `npm audit` could not authenticate to the corporate registry's advisory endpoint. Vulnerability
  status is **NOT VERIFIED**, not "zero" (see `docs/dependencies.md`).
- No Windows host was available; named-pipe IPC stays a Phase 6 item.


## Dispositions (2026-11-27)

- `bb5c527` P1-01: per-chunk overflow counter; framer/bridge tests.
- `99de977` P2-01/02/03/07/08: hard session ceiling, future-timestamp clamp, UTF-8/Latin-1 display
  bounds + protocol table, MCP consistency, terminal-first eviction; tests for each.
- `aac8a35` P2-06: parallel snapshot with bounded per-session permission timeouts.
- `1660413` / `5becb9f`: fuzz corpora and coverage tests (96.62 % lines, 87.17 % branches).
- P2-04/P2-05: planned P5-02; measurement requires a diagnostic flash (no approval yet).
- P3-01/P3-02/P3-04/P3-05: open and documented; no release blocker.
- P5-00 handshake blocker: see `docs/evidence/phase-5-hardware-validation.md`.
