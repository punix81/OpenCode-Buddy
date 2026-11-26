# Phase 3.1 — independent audit investigation

Date: 2026-11-26
Audited commit: `e7a8cb71da0a049f7d09caa8eb5f95fa6af11943`
Working HEAD at start: the same commit (no local change was newer than the audit baseline).
Scope: findings F01–F14 and the additional reliability checks of the Phase 3.1 brief.
Method: source review, baseline tests, targeted reproductions, regression tests, one live OpenCode
2.4.1 session and one firmware compile. **No hardware flash was performed.**

## Baseline

| Check | Result |
| --- | --- |
| `git rev-parse HEAD` | `e7a8cb7…`, identical to the audited commit |
| Bridge typecheck | PASS |
| Bridge tests before changes | 56/56 |
| Plugin tests before changes | 13/13 |
| Protocol validation | PASS (11 valid, 13 invalid) |
| Firmware host tests | PASS (protocol + gestures) |
| Firmware clean build before changes | 371 804 B flash, 20 516 B RAM |

## Dispositions

| ID | Finding | Disposition |
| --- | --- | --- |
| F01 | Permission/question priority | **CONFIRMED — fixed** |
| F02 | Stale sessions after peer disconnection | **CONFIRMED — fixed** |
| F03 | Token accuracy | **CONFIRMED — fixed** |
| F04 | Tool lifecycle accuracy | **CONFIRMED — fixed** |
| F05 | Event subscription health | **CONFIRMED — fixed** (resubscription not induced live) |
| F06 | Reconnect and snapshot consistency | **CONFIRMED — fixed** (stress path not exercised live) |
| F07 | Single bridge instance and IPC ownership | **CONFIRMED — fixed** |
| F08 | USB partial writes and ACK recovery | **PARTIALLY CONFIRMED — fixed on both sides; firmware not flashed** |
| F09 | MCP radar consistency | **CONFIRMED — fixed** |
| F10 | Persistent quiet mode | **CONFIRMED — fixed behind a capability; inactive on the current firmware** |
| F11 | Active session selection | **CONFIRMED — fixed** |
| F12 | NVS writes | **CONFIRMED — fixed** |
| F13 | Diagnostic privacy | **CONFIRMED — fixed** |
| F14 | Cross-project isolation | **CONFIRMED — fixed** |

## F01 — Pending permission and question priority

**Evidence.** `bridge/src/state/registry.ts` stored `permission_required` in `session.status`; a later
`phase` or `tool.*` event overwrote it. `permission.replied` forced the session back to `idle` instead
of the underlying activity. The IPC carried no request identifier, so a reconnect snapshot re-counted
every pending prompt (`bridge/src/live/source.ts` tracked only a session set).

**Correction.**
- `status` now only carries execution activity; pending counters are a derived priority in
  `bridge/src/state/reducer.ts` (`effectiveStatus`). A phase cannot erase a prompt, and resolving it
  restores the real activity.
- Permissions and forms carry an optional `requestId` from the verified OpenAPI payloads
  (`data.id`, `data.requestID`, `data.form.id`); the registry deduplicates by identifier.
- The plugin sends `permission.sync` with the complete pending identifier list from
  `ctx.permission.list()` on every reconnect, so the bridge replaces the set instead of accumulating it.

**Tests.** bridge: "a pending permission keeps priority…", "a permission sync replaces…"; plugin:
"permissions and forms use the session that owns them" now asserts the identifiers.

## F02 — Stale sessions after peer disconnection

**Evidence.** `LiveSource` kept one global `Set` of sessions and only cleared it when the **last** peer
disconnected. One project closing left its sessions visible while another peer kept the link "healthy".

**Correction.** Sessions are owned by the peer that announced them (`sessionsByPeer`, `owners`).
Disconnect, stale-peer timeout and a degraded source close only that peer's sessions. A terminal
session is kept for its notification TTL. Ownership is capped at 64 sessions per peer; deleting the
oldest non-terminal entry is preferred. Session-ID collisions are rejected.

**Tests.** "one peer disconnecting closes only its own sessions", "a terminal notification survives the
peer that produced it".

## F03 — Token accuracy

**Evidence.** `MetricsManager.snapshot()` summed every session, while the model, agent and timer came
from one focus session. `Math.max(current, values.input ?? 0)` turned an unknown counter into zero.

**Correction.** Usage is kept per session and `TokenUsage` fields are `number | null`. The state uses
the focus session's tokens; a missing counter stays `null` and `total` is only computed when both
input and output are known. `session.usage.updated` is cumulative per session, as already recorded in
`docs/live-mode-report.md`; the bridge keeps the maximum per field per session. No context usage, cost
or quota is invented (CTX remains `--`).

**Tests.** "tokens belong to the focus session…", "an unknown token counter stays null…".

## F04 — Tool lifecycle accuracy

**Evidence.** The deduplication key included the outcome, `running` was global, and the cache was
cleared entirely at 8192 entries: starts were lost, duplicate outcomes could decrement `running`, a
missing start was uncountable and a removed session left counters behind.

**Correction.** `MetricsManager` tracks one entry per `(session, message, tool)` with a lifecycle
`running → succeeded|failed`. Duplicate outcomes are ignored, an outcome without a start counts without
touching `running`, and `removeSession` deletes the session's calls. Eviction is deterministic and
only removes completed calls (512 per session). Counters are exposed per session and mirrored into
`SessionState`.

**Tests.** "tools belong to the focus session and survive a missing start", "a duplicate outcome cannot
decrement running twice".

## F05 — Event subscription health

**Evidence.** `plugin/opencode-buddy/index.js` started `ctx.event.subscribe()` once; when the `for await`
ended, only a debug line was written while the heartbeat kept the peer looking healthy.

**Correction.** The subscription is supervised: it reports `source=ok`, and on end/error it reports
`source=degraded`, closes that peer's sessions through the bridge and resubscribes with 1 s → 15 s
backoff, taking a fresh snapshot. OpenCode is never blocked: every failure is caught and the loop only
resubscribes through timers. The bridge handles `source` messages (`bridge/src/ipc/messages.ts`,
`bridge/src/live/source.ts`).

**Evidence.** Live run: `opencode peer=1 source=ok`, `peer=2 source=ok`. A degraded transition was
produced in the IPC test, not by killing the real event stream (**NOT VERIFIED live**).

## F06 — Reconnect and snapshot consistency

**Evidence.** The plugin flushed the old queue and started the snapshot without pausing live sends:
events during the list were written before the snapshot and could be overwritten by older data. Queue
overflow was silent, `socket.write` was unbounded, `MAX_LINE_BYTES` counted UTF-16 code units and there
was no snapshot generation.

**Correction.**
- A connection generation and a `snapshotPending` flag: the backlog is dropped on connect (counted),
  live events are queued during the snapshot and flushed after it; stale snapshots are ignored.
- One `snapshotAt` timestamp is captured before listing and used by every snapshot event, so the bridge
  can reject older transitions with a monotonic `at` guard (`registry.ts`).
- Queue overflow is counted; the socket buffer is bounded (`wire.js`, 256 KiB); frames are measured in
  UTF-8 bytes (`wire.js`, IPC server).
- A link loss re-runs USB discovery instead of reopening the stale port (`transportFactory`).

**Tests.** "reordered events older than a terminal state are ignored", "the IPC line limit is measured
in UTF-8 bytes", "the frame limit is measured in UTF-8 bytes", "a link loss recreates the transport…".
The concurrent snapshot/event race was not reproduced on hardware (**NOT VERIFIED live**).

## F07 — Single bridge instance and IPC ownership

**Evidence.** `IpcServer.start()` wrote the token and unlinked the socket unconditionally: a second
bridge replaced both and the first became unreachable.

**Correction.** A `bridge.lock` file (0600, PID) is acquired with `O_EXCL` **before** any shared file is
touched. A live PID refuses the start; a stale lock is removed and retried once. The runtime directory
must be a real directory (no symlink) owned by the current user, 0700. A non-socket at the socket path
is never unlinked. A failed instance's `stop()` owns nothing and removes nothing.

**Tests.** "a second bridge cannot steal the socket or the token", "a stale lock from a dead process is
recovered", "a non-socket path is never unlinked…".

## F08 — USB partial writes and ACK recovery

**Evidence.**
- Firmware: `FrameWriter` wrote `length + 1` bytes with one `Serial.write`. A short write returns a
  count and the newline can be missing, leaving a truncated NDJSON line; the rest was dropped.
- Bridge: Node `serialport` queues the whole buffer and its callback reports an error or completion, not
  a partial count, so the bridge-side "partial write" claim is a **FALSE POSITIVE** for this API.
- ACK: `pendingAcks` was not cleared on `hello` and never expired.

**Correction.** `firmware/src/TxBuffer.h` stages complete frames in a 2048-byte RAM buffer; the serial
flush writes only what `Serial.availableForWrite()` allows and retries the remainder next loop. The
buffer rejects a whole frame when full: no partial line is ever staged, nothing blocks. The bridge
clears pending ACKs on a new protocol session and expires unacknowledged frames after 10 s with an
explicit warning and a counter. The watchdog fix and the rendering loop are untouched.

**Tests.** `firmware/test/host/test_tx.cpp` (partial sink, lying sink, full buffer, zero-space sink);
"an unacknowledged frame expires instead of being tracked forever". Firmware compiled, **not flashed**;
hardware validation requires approval.

## F09 — MCP radar consistency

**Evidence.** `seedMcp` merged into the previous map, so a removed server stayed forever; totals were
computed after truncating to 16 entries; the registry kept the last MCP snapshot after
`opencode.offline`.

**Correction.** The plugin replaces its MCP map from the authoritative list, counts totals over the
complete list and bounds only the detail array. The IPC accepts the declared totals (validated against
the details) and still caps details at eight for the firmware. `opencode.offline` clears the bridge's
MCP snapshot; the state then sends `online=0 total=0`, never old values.

**Tests.** plugin "an MCP snapshot replaces the list…", bridge "MCP declared totals survive…", registry
"offline OpenCode clears MCP values…". Live: `mcp online=8 total=12`.

## F10 — Persistent quiet mode

**Evidence.** The bridge sent `language=en`, `quietMode=false` on every handshake; the firmware applied
and persisted them, so a reconnect silently reset the user's quiet mode and language.

**Correction.** `config` fields `language`/`quietMode` are optional. A firmware advertises
`caps: ["config.partial"]` and then keeps its stored preference when a field is absent; the bridge sends
the legacy fields only to a firmware without the capability (the image currently on the device, so
nothing breaks before a flash). Explicit host overrides in `config.local.json` still win. Gestures and
auto-return are unchanged.

**Tests.** firmware host "config without preferences"; bridge "a legacy firmware still receives the
fields it requires", "a firmware with config.partial keeps its display preferences", "an explicit host
override…". Protocol schema and `protocol-v1.md` document the optional fields and `caps`.

## F11 — Active session selection

**Evidence.** At equal priority the reducer selected the session with the **oldest** `startedAt`.

**Correction.** At equal priority the most recently updated session wins; permission and user-input
priorities are unchanged. Model, agent, timer, tokens and tools now describe that same session.

**Test.** "the most recently active session wins at equal priority".

## F12 — NVS writes

**Evidence.** Every setter wrote unconditionally, including when the value was unchanged.

**Correction.** `PreferencesManager` compares first and writes only on a real change; the screen,
quiet and language setters keep their safe-shutdown semantics. No storage redesign.

**Validation.** Code review and firmware compile; the Preferences API has no host test harness.

## F13 — Diagnostic privacy

**Evidence.** The default debug file was `/tmp/opencode-buddy-debug.log` with default permissions, and
messages contained project directories, session identifiers and raw error strings.

**Correction.** The debug file now defaults to the private runtime directory (`0700`) with mode `0600`,
is capped at 1 MiB and stops on write errors. Messages are sanitized (absolute paths, `ses_/perm_/
form_/…` identifiers, control characters) and no longer include locations, session IDs or raw errors.
Documentation was scanned: no home directory, proxy or board identifier is committed (the `303a:1001`
and `/dev/ttyACM0` mentions are generic hardware facts, MAC addresses stay out).

**Tests.** `wire.test.mjs` checks byte limits and sanitization.

## F14 — Cross-project isolation

**Evidence.** `belongs()` returned `true` for any event without a location, including an arbitrary
`session.created`; another project's location-less events could therefore be adopted.

**Correction.** `plugin/opencode-buddy/isolation.js` accepts a located event only for this plugin's
directory; a location-less event only for a session already owned, and never `session.created`; global
events only through the explicit `mcp.status.changed` allowlist. Foreign events no longer delete local
session ownership.

**Tests.** `isolation.test.mjs` (7 cases).

## Additional reliability checks

| Risk | Disposition |
| --- | --- |
| OpenCode unavailable while USB is connected | **CONFIRMED — fixed**: `aggregateStatus` returns `offline` in LIVE unless a terminal notification is still observable; test "offline OpenCode clears MCP values but keeps a terminal notification" and the live startup log (`status=offline` before the peer) |
| Old MCP values after OpenCode disconnects | **CONFIRMED — fixed**: MCP snapshot cleared on `opencode.offline`; `online=0 total=0` |
| Reordered events resurrecting a completed session | **CONFIRMED — fixed**: monotonic `at` guard in the registry, `execution.started` exempt for the snapshot restore |
| Terminal notification lost when a short-lived process disconnects | **CONFIRMED — fixed**: terminal sessions are kept on peer loss until their TTL |
| Unbounded plugin write buffer | **CONFIRMED — fixed**: 256 KiB bound with a drop counter; queue cap 500 with a drop counter |
| IPC limits in UTF-8 bytes | **CONFIRMED — fixed**: server and plugin use `Buffer.byteLength`; test with 5000 two-byte characters |
| USB re-enumeration on a different port | **CONFIRMED — fixed**: `transportFactory` re-runs discovery; test with a second memory transport |
| Growing memory in extended use | **CONFIRMED — mitigated**: session TTL 30 min, 64-session cap, per-session tool eviction, bounded queues/caches; test "an inactive session is pruned…" |

## Not verified / limitations

1. The firmware was **not flashed**. F08, F10 and F12 take full effect only after an approved flash;
   the current image keeps receiving the legacy config fields, so quiet mode is still reset until then.
2. Event-source resubscription and the concurrent snapshot race were tested at the unit/IPC level, not
   by killing a real OpenCode subscription.
3. Permission and form **live** prompts remain unobserved (Phase 3 carry-over); identifiers and
   deduplication are verified from the OpenAPI schema and synthetic events.
4. The one-hour soak and heap/FPS measurements remain open.
5. One provider (DeepSeek) was exercised end to end.
