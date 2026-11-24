# OpenCode v2 API audit — Phase 0

Goal: determine, against the installed software rather than assumptions, which integration mechanism
OpenCode Buddy should use and which activity signals are reliably observable.

## 1. Installed software

| Item | Value | How verified |
| --- | --- | --- |
| OpenCode CLI | **2.4.1** | `opencode --version` |
| Server | running, version 2.4.1, loopback URL | `opencode service status`; `opencode api get /api/info` |
| Plugin SDK | `@opencode/plugin` **2.4.1** (matches CLI) | `npm view @opencode/plugin version`; installed into a scratch dir and inspected |
| Client/SDK | `@opencode/client` 2.4.1 | installed into a scratch dir and inspected |
| API description | OpenAPI 3.1, title `opencode HttpApi`, 146 paths, 542 schemas | `opencode api get /openapi.json` (local server, authoritative for 2.4.1) |
| Event variants | **101** entries in the `V2Event` union | local OpenAPI document |
| DeepSeek availability | two DeepSeek-family models listed by `opencode models` | `opencode models` |
| Ollama | no Ollama provider model listed in the current configuration | `opencode models` (keyword filter) |

The official documentation was cross-checked (`https://opencode.ai/docs/build/plugins`,
`/build/plugins/server`, `/api`, `/build/client`). The local server's OpenAPI document wins where they
differ, because it describes the installed version.

## 2. Integration options evaluated

| Option | Data access | Latency | Auth / coupling | Verdict |
| --- | --- | --- | --- | --- |
| **Server plugin** (`@opencode/plugin`) | Full typed event stream, sessions, permissions, MCP, tools; runs inside the server | Event-driven, immediate | No HTTP auth needed; tied to the plugin API major version | **Chosen** |
| HTTP event stream (`GET /api/event`) | Same events (SSE) | Immediate | Requires the server's bearer authentication; `opencode api` wraps it | Viable fallback, more moving parts |
| HTTP polling of sessions | Coarse state only | Poll interval | Auth required | Rejected: loses reasoning/tool phases, adds load |
| Log tailing | Implementation detail, unstable | High | None | Rejected: undocumented, privacy risk, brittle |
| TUI/GUI hooks | Terminal or desktop only | n/a | Per-client | Rejected: does not cover all clients |

Two empirical notes:

- The HTTP surface rejects unauthenticated requests: a direct `curl` of `/api/event` returned
  `{"_tag":"UnauthorizedError","message":"Authentication required"}`. Any HTTP-based integration must
  obtain the server's credentials, which the official CLI does for us.
- A 5 s anonymous `opencode api get /api/event` produced no output while the server was idle. That is
  consistent with an authenticated streaming endpoint that emits `server.connected` only to clients,
  but it is **not** proof of delivery and is recorded as NOT VERIFIED. The plugin receives events
  in-process per the official documentation and the SDK types; end-to-end delivery is a Phase 3
  acceptance test.

## 3. Plugin API surface (verified from type declarations)

`@opencode/plugin` 2.4.1, entrypoint `.` → `dist/promise/index.d.ts`:

```ts
export default Plugin.define({
  id: "opencode-buddy",
  async setup(ctx) { /* ... */ return cleanup },
})
```

`Plugin.Context` provides, among others:

| Domain | Relevant members | Use in Buddy |
| --- | --- | --- |
| `event` | `subscribe({ types?, signal }) → AsyncIterable<Event>` | Primary event source |
| `session` | `list`, `get`, `context`, `interrupt` (read-only use) | Seed active sessions, read model/agent |
| `permission` | `list`, `get` | Seed pending permissions |
| `mcp` | `list` | Seed MCP status |
| `app` | `version` | Diagnostics |
| `location` | `directory`, `project` | Correlation (not transmitted) |
| `storage` | `get/set/remove/scan` | Optional local cache |
| `options` | Plugin options from configuration | Bridge endpoint, enable/disable |

Explicitly **not** used: `tool.transform`, `session.prompt`, `session.command`, `permission.reply`,
`mcp.transform`, `experimental.generate`. Buddy must never act on the session.

## 4. Observability matrix

Every signal required by `docs/requirements.md` mapped to a verified v2 event or to a documented gap.

| Requirement | Signal source | Status |
| --- | --- | --- |
| Execution start | `session.execution.started` (`data.sessionID`) | VERIFIED (schema) |
| Execution success | `session.execution.succeeded` | VERIFIED (schema) |
| Execution failure | `session.execution.failed` (`data.error.type/message/status`) | VERIFIED (schema) |
| Execution interrupted | `session.execution.interrupted` (`reason: user/shutdown/superseded/inactivity`) | VERIFIED (schema) |
| Reasoning | `session.reasoning.started/delta/ended` | VERIFIED (schema) |
| Response generation | `session.text.started/delta/ended`, `session.step.streamed` | VERIFIED (schema) |
| Step boundaries | `session.step.started/first-token/ended/failed` (carry `agent`, `model`) | VERIFIED (schema) |
| Tool start | `session.tool.called` (`id`, `input`, `executed`) | VERIFIED (schema) |
| Tool progress | `session.tool.progress` | VERIFIED (schema) |
| Tool success | `session.tool.success` (`id`, `content`, `metadata`) | VERIFIED (schema) |
| Tool failure | `session.tool.failed` (`error`) | VERIFIED (schema) |
| Retry | `session.retry.scheduled` (`attempt`, `at`, `error`), `session.status` (`retry`, attempt) | VERIFIED (schema) |
| Compaction | `session.compaction.started/delta/ended/failed` | VERIFIED (schema) |
| Permission pending | `permission.asked` (`id`, `sessionID`, `action`, `resources`) / `permission.replied` | VERIFIED (schema) |
| User input / question | `form.created` / `form.replied` / `form.cancelled` | ASSUMPTION: forms are the user-question flow; confirm in Phase 3 |
| Model and agent | `session.step.started` (`model`, `agent`), `session.model.selected`, `session.agent.selected`, `Session.Info` | VERIFIED (schema) |
| Token usage | `session.usage.updated` (`tokens.input/output/reasoning/cache`, `cost`) | VERIFIED (schema); cumulative vs delta semantics ASSUMPTION |
| Session idle | `session.idle`, `session.status` (`idle`) | VERIFIED (schema) |
| MCP status | `mcp.status.changed` + `ctx.mcp.list()` → `Mcp.Server.status` | VERIFIED (both) |
| Context-window percentage | `Model.Info.limit.context` vs session tokens | ASSUMPTION: needs a reliable used-token definition |
| Quota / rate limits | — | **NOT AVAILABLE** in the v2 API surface reviewed |
| Multiple sessions | Every event carries `sessionID` | VERIFIED (schema) |

MCP status values, verified from `Mcp.Server`: `connected`, `pending`, `disabled`, `failed` (with
`error`), `needs_auth` (with `error`). A live `mcp.list` call during the audit returned 12 configured
servers: 10 `connected`, 1 `needs_auth`, 1 `failed` (HTTP 404). This proves the status API reflects
real connection outcomes; the specific names are intentionally not recorded here.

## 5. Event envelope

Events delivered to a plugin are objects with:

```ts
type Event = {
  id: Event.ID
  type: string            // e.g. "session.tool.success"
  created: number         // epoch ms
  data: unknown           // per-type payload
  location?: Location.Ref // project/directory context
  durable?: { aggregateID: string; seq: Event.Seq; version: ... } // session-scoped events
}
```

- Durable session events carry a per-aggregate `seq` and `version`, which is exactly what the bridge
  needs to detect gaps and out-of-order delivery. **Use them; do not invent a second ordering scheme.**
- `server.connected` is delivered to SDK clients but **not** to plugins (documented). The plugin must
  not wait for it.
- Unknown event types must be ignored, not treated as errors.

## 6. Limitations and risks

| # | Limitation | Impact | Mitigation |
| --- | --- | --- | --- |
| L1 | Plugin API is experimental and versioned with the CLI; breaking changes are possible | Plugin may stop loading after an OpenCode upgrade | Pin the supported CLI minor, fail soft with a visible "plugin incompatible" state, document the supported range, test against upgrades |
| L2 | No quota/rate-limit API | Tokens screen cannot show remaining quota | Show "not supported" explicitly (FR-012); never fabricate |
| L3 | Context percentage needs a reliable denominator | Wrong gauge is worse than none | Only show when `limit.context` is known and the used-token definition is stable; otherwise `--` |
| L4 | `form.*` semantics unconfirmed | "User input required" may be missed | Phase 3 empirical test with a real question flow; fallback: permission alerts still cover blocking cases |
| L5 | Multiple server instances (`--standalone`, multiple projects) each load their own plugin instances | Sessions may be split across plugin instances | Each instance reports; the bridge merges by session ID and deduplicates |
| L6 | Event payloads include high-risk fields (`input`, `content`, `text`, `reasoning`, `native`, `metadata`) | Accidental leakage | Hard allowlist projection at the plugin boundary; tests assert these never appear on the wire |
| L7 | `session.usage.updated` semantics unconfirmed | Double counting | Treat as cumulative-per-session snapshot and clamp to max; verify in Phase 3 |
| L8 | HTTP SSE requires authentication | Not used, but blocks naive scripts | Document the plugin path as the supported one |
| L9 | Plugin loading requires configuration or a project `.opencode/plugins/` directory | Install friction | Phase 6 installer prints the exact configuration change; Phase 3 uses a project-local plugin during development |

## 7. Mapping decisions for the reducer

- A tool failure is **not** an execution failure. `session.tool.failed` increments counters and shows
  a transient accent; only `session.execution.failed` sets `error`.
- `session.status` with `type: "retry"` and `session.retry.scheduled` are the same phenomenon at
  different granularity; the reducer keeps one retry state with the highest attempt number.
- `success` is derived from `session.execution.succeeded` and expires; it is a notification, not a
  steady state.
- Interruption reasons map as: `user` → INTERRUPTED, `superseded` → IDLE (a new execution follows),
  `shutdown` → OFFLINE (server went away), `inactivity` → INTERRUPTED with a different label.
- Timers use `created` deltas and bridge monotonic time, never the device clock.

## 8. Reproduction

```sh
opencode --version
opencode service status
opencode api get /api/info
opencode api get /openapi.json > openapi.json      # inspect V2Event and Mcp.Server
opencode models
opencode mcp list
```

SDK inspection was performed in a throwaway directory (outside this repository) with:

```sh
npm install @opencode/plugin@2.4.1 @opencode/client@2.4.1
```

No project dependency was added in Phase 0, and no existing OpenCode configuration was modified.
