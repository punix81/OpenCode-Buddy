# LIVE mode report

Date: 2026-11-26
Scope: everything that makes `npm run live` work with a real OpenCode 2.4.1 installation.
Companion documents: `docs/opencode-integration.md` (behaviour), `docs/opencode-v2-event-mapping.md`
(payloads), `docs/plugin-installation.md` (setup), `docs/phase-3-report.md` (phase verdict).

## 1. Goal

Replace simulated data in normal operation with real OpenCode events, without touching the firmware,
the ratified NDJSON v1 protocol, or the Codex Astra visual design.

## 2. Final architecture

```
OpenCode 2.4.1 (Bun, inside the server)
  └─ plugin opencode-buddy        → ctx.event.subscribe()
       │  filter on location.directory
       │  per-type allowlist projection
       └─ Unix socket 0700 + 0600 token (256 bits)
            └─ live bridge (Node/TS) → validation, registry, privacy
                 └─ NDJSON v1 over USB → ESP32-C3 (firmware unchanged)
```

The local HTTP API was rejected: `/api/event` answers `UnauthorizedError` without credentials
(verified on `127.0.0.1:49374`). The plugin is the only integration point that needs no OpenCode
credential, and it runs in the server process.

## 3. What was implemented

| File | Responsibility |
| --- | --- |
| `plugin/opencode-buddy/index.js` | lifecycle, event loop, snapshot, reconnect 1 s → 15 s, bounded queue (500) |
| `plugin/opencode-buddy/map.js` | pure projection to `NormalizedEvent`, no I/O |
| `bridge/src/ipc/paths.ts` | shared runtime path (`$XDG_RUNTIME_DIR/opencode-buddy`) |
| `bridge/src/ipc/messages.ts` | IPC v1 parsing, default-deny, MCP projection and anonymisation |
| `bridge/src/ipc/server.ts` | Unix socket, 0700/0600, token, 8 KiB lines, 200 msg/s, 8 peers |
| `bridge/src/live/source.ts` | per-peer liveness, offline after 15 s, session invalidation |
| `bridge/src/cli/live.ts` | `npm run live` / `npm start` |
| `bridge/src/cli/diagnose-opencode.ts` | `npm run diagnose:opencode` |
| `scripts/install-buddy-plugin.mjs` | prints the exact config change, never rewrites the global file |

## 4. Event flow for one prompt

```
session.execution.started     → THINKING
session.step.started          → model + agent
session.step.first-token      → GENERATING
session.tool.called/success   → WORKING (+ category), back to THINKING
session.usage.updated         → cumulative tokens (max per session)
session.execution.succeeded   → SUCCESS, then IDLE
```

Deliberately ignored: response and reasoning deltas, tool arguments and output, titles, paths.
See `docs/opencode-v2-event-mapping.md` §5.

## 5. Security (two independent barriers)

1. **Filesystem**: directory `0700`, socket and token file `0600`. No TCP port is opened.
2. **Per-run token**: 256 bits, compared with `crypto.timingSafeEqual` in the first frame, 2 s window,
   otherwise the connection is destroyed before any payload is parsed.
3. Allowlist in the plugin, **re-validation** in the bridge with the existing normalizer.
4. MCP names replaced by `MCP-1…8` unless `allowRealMcpNames`.
5. Strictly read-only plugin: no `permission.reply`, `session.prompt`, `shell.*` or `tool.transform`.

## 6. Measured behaviour

| Observation | Value |
| --- | --- |
| Plugin → bridge handshake | a few milliseconds after connect |
| State frames | one per second, ACK 10–86 ms (mean 48 ms on a live run) |
| Prompt without tools | `thinking → generating → success` |
| Real `ls` command | `status=working`, `tools=3/0/1`, then `tools=4/0/0` |
| Tokens | real, cumulative, consistent with `session export` (11 879 input / 127 output) |
| MCP radar | `online=7 total=12` |
| Execution duration after a bridge restart | restored from `Session.Info.time.busy`; `elapsed=353 s` and counting |
| Plugin disconnect | sessions closed, pending counters cleared, IDLE/OFFLINE |

## 7. Defects found by real data (all fixed)

| # | Defect | Evidence |
| --- | --- | --- |
| 1 | Snapshot restored sessions from **other projects** | 31.9 M input tokens shown for an 11 879-token session → `location` filter + 15 min window |
| 2 | `ctx.permission.list({})` throws `Missing key ["sessionID"]` | now queried per restored session |
| 3 | `mcp.status.changed.data.server` is a **name string**, with no status | three wrong hypotheses tested → `ctx.mcp.list()` re-query |
| 4 | More than **8** MCP servers were rejected silently by the bridge | `online=0` with 12 servers → `IPC_MAX_DETAIL=8`, real counters kept |
| 5 | `plugin@version` was redacted as an e-mail address | log message rewritten |
| 6 | Session chronometer stayed at 00:00 when the bridge attached mid-execution | no `execution.started` in the snapshot → `time.busy` restore; `elapsed=353 s` after the restart |

In addition, the bridge reliability fix from the previous session (7 s handshake timeout, bounded
transport close, guaranteed CLI exit) is what keeps a LIVE session from freezing silently.

## 8. Tests

- Bridge: **45/45**, including 7 new IPC tests (permissions, token, multiple peers, default-deny, MCP
  anonymisation, stale session cleanup).
- Plugin: **11/11**, including prompt/argument leakage and "name-only MCP event invents no status".
- Typecheck: 0 diagnostics. Protocol vectors: PASS. Firmware host parser: PASS.

## 9. Commands

```sh
cd bridge
npm run live                            # LIVE (default)
npm run diagnose:opencode               # version, plugin, socket, token, device
npm run mock -- --scenario all-states   # MOCK, explicit
node ../scripts/install-buddy-plugin.mjs
```

## 10. Limitations

1. `permission.asked` and `form.created`: payload VERIFIED, **not triggered live** (no safe
   non-interactive path).
2. Two simultaneous *active* executions not observed (standalone runs serialize); covered by reducer
   tests, multiple peers accepted and verified.
3. One-hour soak and heap/FPS measurements remain **OPEN** (Phase 2 carry-over).
4. Windows named pipes not implemented; Linux/macOS only.
5. A single provider tested (DeepSeek).

## 11. Local commits

```
6236997 fix(mcp): make the radar work on real OpenCode data
0a2bef4 docs: record the Phase 3 integration, baseline and evidence
bc0487e feat(plugin): forward OpenCode v2 events over the local IPC
297cdfd feat(bridge): add secure local IPC and the live OpenCode mode
703c6c7 fix(bridge): recover from a missed handshake instead of waiting forever
```

## 12. Verdict

**LIVE operational**: the six screens receive real data, MOCK is isolated, disconnection is clean and
security relies on two independent barriers. Phase 3 stays **PASS WITH RESERVATIONS** (permission and
form not observed live, soak open).
