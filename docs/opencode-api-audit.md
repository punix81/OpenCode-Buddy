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

Re-verified on 2026-11-24 in a second audit pass: `opencode --version` → 2.4.1; the OpenAPI document
still reports 146 paths, 542 schemas and 101 `V2Event` variants; `npm view @opencode/plugin version`
and `npm view @opencode/client version` both return 2.4.1 from the configured registry; a live
`/api/mcp` call returns 12 servers in states `connected: 10`, `needs_auth: 1`, `failed: 1`. Server
names are deliberately not recorded.

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

## 3.1 Payload-level facts that constrain the adapter

Read directly from the 2.4.1 component schemas, not inferred. These decide what the plugin may look at
and what it must drop before the bridge ever sees an event.

| Event | Payload | Consequence for Buddy |
| --- | --- | --- |
| `session.execution.started` / `.succeeded` | `sessionID` only | The event type itself carries the meaning; no extra correlation needed. |
| `session.execution.failed` | `error: Session.StructuredError` = `{type, message, status?, response.body?, retryAfterMs?}` | Forward only `error.type` and `error.status`. `message` and `response.body` are provider/model text and are **dropped**. |
| `session.execution.interrupted` | `reason: user \| shutdown \| superseded \| inactivity` | Matches the reducer mapping in §7; `superseded` is not a user-visible warning. |
| `session.step.started` | `agent`, `model`, `started` | Primary source for the model/agent shown on screens 1–2. |
| `session.tool.called` | `assistantMessageID`, `id`, `input`, `executed`, `native` | Dedup key is `(sessionID, assistantMessageID, id)`. `input` and `native` never leave the plugin. |
| `session.tool.progress` | `id`, `metadata` | Used only to keep a running tool alive; `metadata` is dropped. |
| `session.tool.success` / `.failed` | `id`, `content[]`, `metadata`, `error?` | Counters only. `content` holds tool output (file text, command output) and is **dropped**. |
| `permission.asked` | `id`, `action`, `resources[]`, `save[]`, `metadata`, `source`, `message` | Only the existence of a pending request is forwarded. `resources` and `message` describe paths and intent and are **dropped**. |
| `form.created` | `form: Form.Info {title, fields}` | Confirms user questions are a first-class concept. Title and fields are **not** forwarded; only the pending count is. |
| `session.usage.updated` | `cost`, `tokens {input, output, reasoning, cache{read,write}}` | `Session.Info.tokens` has the same shape, which supports the "cumulative snapshot" reading (A-02) without proving it. Phase 3 tests it. |
| `mcp.status.changed` | `server` **only** | This is a refresh *signal*, not a status report. The adapter must re-read `ctx.mcp.list()` and diff; expecting a status here would silently produce stale MCP data. |
| `session.retry.scheduled` | `attempt`, `at`, `error` | `attempt` and `at` are displayable; `error` is dropped like every other error body. |
| `session.idle` | `sessionID` | Drives the grace-period removal from the active set. |

Two endpoint-level facts:

- `GET /api/event` is an SSE stream whose frames are `{id, event, data}`, with `data` an encoded
  `V2Event`. It requires authentication; the in-process plugin path avoids that entirely.
- The `types` filter on that endpoint enumerates 101 values that match the `V2Event` union exactly, so
  the plugin's `types` option can be trusted to be complete rather than a hand-maintained subset.

## 3.2 Privacy consequence of the payload facts

The highest-risk fields are not in the event *names* but in the payloads: `session.tool.called.input`,
`session.tool.success.content`, `permission.asked.resources`, and every `Session.StructuredError`
message or response body. A naive "forward the event minus a few keys" design fails here. The adapter
must build a new object from an allowlist per event type, which is what `docs/security.md` §3 requires
and what Phase 3 must test by construction.

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
| User input / question | `form.created` / `form.replied` / `form.cancelled`, each carrying `Form.Info {title, fields}` | PARTIAL: forms are a real, typed user-input concept; whether agent flows raise them on every client is confirmed in Phase 3 |
| Model and agent | `session.step.started` (`model`, `agent`), `session.model.selected`, `session.agent.selected`, `Session.Info` | VERIFIED (schema) |
| Token usage | `session.usage.updated` (`tokens.input/output/reasoning/cache`, `cost`) | VERIFIED (schema); cumulative vs delta semantics ASSUMPTION |
| Session idle | `session.idle`, `session.status` (`idle`) | VERIFIED (schema) |
| MCP status | `mcp.status.changed` carries only `server`; status comes from `ctx.mcp.list()` → `Mcp.Server.status` | VERIFIED (both) — the event is a refresh signal, not a status payload |
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
| L4 | `form.*` existence is verified, but whether every client raises a form for a blocking question is not | "User input required" may be missed on some flows | Phase 3 empirical test with a real question flow; fallback: permission alerts still cover blocking cases |
| L5 | Multiple server instances (`--standalone`, multiple projects) each load their own plugin instances | Sessions may be split across plugin instances | Each instance reports; the bridge merges by session ID and deduplicates |
| L6 | Event payloads include high-risk fields (`input`, `content`, `text`, `reasoning`, `native`, `metadata`) | Accidental leakage | Hard allowlist projection at the plugin boundary; tests assert these never appear on the wire |
| L7 | `session.usage.updated` semantics unconfirmed | Double counting | Treat as cumulative-per-session snapshot and clamp to max; verify in Phase 3 |
| L8 | HTTP SSE requires authentication | Not used, but blocks naive scripts | Document the plugin path as the supported one |
| L9 | Plugin loading requires configuration or a project `.opencode/plugins/` directory | Install friction | Phase 6 installer prints the exact configuration change; Phase 3 uses a project-local plugin during development |
| L10 | `mcp.status.changed` carries no status, only the server name | A naive handler shows stale MCP state | Treat it strictly as a refresh trigger and re-read `ctx.mcp.list()`; covered by a Phase 5 test |

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
