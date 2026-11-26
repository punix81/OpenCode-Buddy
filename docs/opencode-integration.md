# OpenCode v2 integration

How the Buddy gets real data. Phase 3 replaced the mock adapter with an OpenCode v2 plugin in normal
operation; the mock remains available as an explicit development mode.

## 1. Architecture

```
OpenCode 2.4.1 server (Bun)
  └─ plugin/opencode-buddy        server plugin, loaded per location
       │  ctx.event.subscribe()   public v2 event stream
       │  allowlist projection    fixed fields only
       └─ Unix socket + token     $XDG_RUNTIME_DIR/opencode-buddy/bridge.sock
            │                     first frame carries a 256-bit per-run token
            └─ bridge (Node, TS)  validation, registry, reducer, metrics, privacy
                 └─ NDJSON v1 over USB CDC → ESP32-C3 (unchanged firmware)
```

Why a plugin and not the HTTP API: `/api/event` on the running service answers `UnauthorizedError`
without credentials, and the plugin API gives the same stream in-process, without handling a token for
OpenCode itself.

Why no firmware change: every value Phase 3 needs already exists in the NDJSON v1 `state` message.

## 2. Operating modes

| Mode | Command | Data | Marking |
| --- | --- | --- | --- |
| **LIVE** (default) | `npm run live` / `npm start` | real OpenCode events only | `source=live`, no MOCK badge |
| MOCK (development) | `npm run mock -- --scenario …` | synthetic scenario | `source=mock`, MOCK badge on device |
| OFFLINE | no bridge, or no plugin | nothing fabricated | `opencode=offline`, sessions cleared |

There is no runtime switch and **no fallback from LIVE to MOCK**. A missing plugin leaves the device
IDLE/OFFLINE, never fed with simulated activity. Because the modes are separate processes, their
registries and counters cannot mix.

## 3. What the six screens show in LIVE

| Screen | Real fields | Source | Unknown behaviour |
| --- | --- | --- | --- |
| 1 Buddy | state, model, agent, pending permissions/questions, link status, source | derived | `--` when not yet known |
| 2 Session | model, agent, execution duration, active sessions, status | `session.step.started`, `session.execution.*` | duration `0` until an execution starts |
| 3 Tokens | input, output, total (sum of per-session maxima), reasoning/cache in the pipeline | `session.usage.updated` | `--` when no usage was ever seen; CTX always `--` |
| 4 Tools | running, success, failed, categories (read/edit/shell/search/mcp/other) | `session.tool.*` + `input.started.name` | category `other` when the name is unknown |
| 5 MCP Radar | online/total, per-server status | `mcp.status.changed`, `ctx.mcp.list()` | `-- online / -- off` when no data |
| 6 System | USB, bridge, OpenCode, firmware, bridge version, protocol | derived | OpenCode version **not displayed** (no protocol field) |

Privacy: MCP server names are replaced by `MCP-1…MCP-8` unless `allowRealMcpNames` is true. Prompts,
responses, reasoning, tool arguments, tool output, commands and paths never leave the plugin.

## 4. Lifecycle and failure behaviour

| Situation | Behaviour |
| --- | --- |
| Plugin connects | `hello` → `opencode.connected`, then a snapshot of recent sessions, MCP and pending permissions |
| Plugin disconnects | `opencode.offline`, every session it announced is closed, pending counters disappear |
| Plugin silent > 15 s | treated as disconnected (watchdog in the bridge) |
| Bridge down | plugin reconnects with 1 s → 15 s backoff; OpenCode is unaffected |
| Device unplugged | bridge reconnects the serial port; OpenCode is unaffected |
| Bridge restart | new token and socket; the plugin reconnects and restores the snapshot, including the current execution start from `Session.Info.time.busy` |
| USB replug | firmware handshake + full snapshot (Phase 2 behaviour, unchanged) |

## 5. Metrics semantics

`session.usage.updated` is a **cumulative snapshot** per session. The bridge keeps the maximum per
session (`MetricsManager`) and sums the maxima of the sessions it currently tracks. Two consecutive
events during one prompt moved input from 35 609 to 36 323 and output from 305 to 313, never resetting,
which matches a cumulative counter.

`session.usage.recorded` (title/compaction/generate) is deliberately ignored: adding it to
`usage.updated` would double count.

Context occupancy is **not** available: no verified field exposes the model's context capacity per
session. `CTX --` therefore stays on screen, as required.

## 6. Session scope

One plugin instance runs per OpenCode location; the public stream carries every location of the
server, so the plugin filters events on `location.directory` and restores only sessions of its own
location updated in the last 15 minutes. Without that filter the Buddy received another project's
31.9 M input-token total at connect time — measured, then fixed.

## 10. Phase 3.1 behaviour changes

| Area | Behaviour |
| --- | --- |
| Event source health | The plugin sends `source=ok|degraded`. Degraded closes that peer's sessions and reports OpenCode offline; the plugin resubscribes with 1 s → 15 s backoff |
| Permissions and forms | Request identifiers are forwarded and deduplicated; `permission.sync` replaces the pending set from `ctx.permission.list()` on every reconnect. Resolution restores the underlying activity |
| Metrics scope | The state carries the focus session's tokens and tools; unknown counters are `null`; at equal priority the most recently active session wins |
| MCP | Snapshots replace the server list; totals cover the complete verified list while the detail array stays capped for the protocol |
| Snapshots | One timestamp per snapshot and a connection generation; the backlog is dropped on connect and live events are queued during the snapshot |
| Preferences | `config` may omit `language`/`quietMode` for a firmware that advertises `config.partial`; the device keeps its stored preference |
