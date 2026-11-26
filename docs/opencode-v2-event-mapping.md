# OpenCode v2 event mapping

Verified against the installed OpenCode **2.4.1** and its OpenAPI document
(`opencode api get /openapi.json`, 146 paths, 101 event schemas), the shipped types of
`@opencode/schema@2.0.16`, the public documentation (`opencode.ai/docs/build/plugins/server`), and a
live plugin session that captured the real sequence of a prompt.

Classifications:

- **VERIFIED** — the payload shape and the field used here were observed or are in the installed schema.
- **PARTIALLY SUPPORTED** — the event exists but a required distinction is missing.
- **NOT AVAILABLE** — no verified source exists; the Buddy must show unknown.
- **NOT VERIFIED** — plausible but not exercised in this phase.

## 1. Integration surface

| Question | Answer | Evidence |
| --- | --- | --- |
| Where does a plugin run? | Inside the OpenCode server process | docs (`Server` part), probe `ctx.app.version` 2.4.1 |
| Runtime | Bun (`argv[0]=bun`, `node:net` available) | probe `exec`/`hasNet` |
| Event API | `ctx.event.subscribe({ types?, signal })` → `AsyncIterable<V2Event>` | `@opencode/plugin` `EventDomain`, docs |
| HTTP API | requires credentials; `/api/event` answers `UnauthorizedError` without them | direct `curl` on `127.0.0.1:49374` |
| MCP status | `ctx.mcp.list()` returns `{ data: Mcp.Server[] }` | OpenAPI `/api/mcp`, probe snapshot |
| Permission list | `ctx.permission.list({ sessionID })` — session-scoped | OpenAPI + runtime error `Missing key ["sessionID"]` |
| Session list | `ctx.session.list({ directory, limit })` → `{ data: Session.Info[] }` | OpenAPI `SessionsResponse` |

The event stream is **server-wide**: it carries every location the server serves. A plugin instance is
bound to one location (`ctx.location.directory`), so every event is filtered on its envelope
`location.directory` before it is used. This was found the hard way: without the filter the Buddy
received another project's usage totals (31.9 M input tokens) at connect time.

## 2. Buddy functionality → OpenCode v2 source

| Buddy functionality | OpenCode v2 source | Payload used | Availability | Evidence | Fallback |
| --- | --- | --- | --- | --- | --- |
| OpenCode reachable | plugin `hello` over IPC (`ctx.app.version`) | version, pid | VERIFIED | peer logged `app=cli version=2.4.1` | OFFLINE after 15 s silence |
| Session created | `session.created` | `data.sessionID`, `agent`, `model` | VERIFIED | schema + snapshot | `session.list` snapshot |
| Session deleted | `session.deleted` | `data.sessionID` | VERIFIED | schema | 15 min recency window |
| Execution starts | `session.execution.started` | `data.sessionID` | VERIFIED | captured | `session.status busy` |
| Execution succeeded | `session.execution.succeeded` | `data.sessionID` | VERIFIED | captured (`status=success`) | — |
| Execution failed | `session.execution.failed` | `data.sessionID`, `error` | VERIFIED | schema | — |
| Execution interrupted | `session.execution.interrupted` | `data.sessionID`, `reason` | VERIFIED | schema | `session.idle` |
| THINKING | `session.step.started`, `session.reasoning.started` | `sessionID` | PARTIALLY SUPPORTED — "thinking" is a step start, not proof of reasoning | captured | stays GENERATING |
| GENERATING | `session.step.first-token`, `session.text.started` | `sessionID` | VERIFIED | captured | — |
| WORKING | `session.tool.called` → `session.tool.success/failed` | `sessionID`, `id`, `assistantMessageID` | VERIFIED | captured (`tools=3/0/1`) | — |
| Tool category | `session.tool.input.started` | `data.name` | VERIFIED | captured | `other` |
| Tool success/failure | `session.tool.success` / `.failed` | `id` | VERIFIED | captured | — |
| Retry | `session.status` with `status.type === "retry"` | `attempt` | VERIFIED | schema | `session.retry.scheduled` |
| Compaction | `session.compaction.started/ended/failed` | `sessionID` | VERIFIED | schema | — |
| Permission required | `permission.asked` / `permission.replied` | `sessionID` | VERIFIED (payload) / **NOT VERIFIED** (live trigger) | schema | pending counter from `permission.list` |
| User input required | `form.created` / `form.replied` / `form.cancelled` | `form.sessionID`, `id` | VERIFIED (payload) / **NOT VERIFIED** (live trigger) | schema | — |
| Input tokens | `session.usage.updated` → `tokens.input` | cumulative | VERIFIED | two consecutive events, `max()` merge | `session.list` snapshot |
| Output tokens | same → `tokens.output` | cumulative | VERIFIED | 127 output for a 3-sentence answer | — |
| Reasoning tokens | same → `tokens.reasoning` | cumulative | VERIFIED | 88 in the export | hidden unless measured |
| Cache read/write | same → `tokens.cache.read/write` | cumulative | VERIFIED | 0/0 on this provider | — |
| Model | `session.step.started`, `session.model.selected` | `model.id` | VERIFIED | `deepseek-v4-1-flash-1017-r` | `--` |
| Agent | `session.step.started`, `session.agent.selected` | `agent` | VERIFIED | `build` | `--` |
| Execution duration | `session.execution.started`; on reconnect `Session.Info.time.busy`; first phase as last resort | bridge clock | VERIFIED | bridge `elapsedSeconds`, 353 s after a bridge restart | starts at the first trace seen if the start was missed |
| MCP status | `mcp.status.changed` (trigger) + `ctx.mcp.list()` (authoritative) | `Mcp.Server[]` with `status.status` | VERIFIED | real run: `online=7 total=12` on the bridge | `online 0 / total 0` |
| Context occupancy (CTX) | — | — | **NOT AVAILABLE** | no capacity field in v2 events or `Session.Info` | stays `CTX --` |
| OpenCode version on screen 6 | — | — | **NOT AVAILABLE** | NDJSON v1 has no field, protocol frozen | not displayed |

## 3. Event sequence captured for one prompt

Real capture (types only, one prompt, no tools):

```
session.inbox.enqueued → session.execution.started → session.instructions.updated →
session.inbox.delivered → session.usage.updated → session.renamed → session.step.started →
session.step.first-token → session.text.started → session.text.delta (×N) → session.text.ended →
session.step.streamed → session.step.ended → session.usage.updated → session.execution.succeeded
```

With one `bash` tool the sequence adds `session.tool.input.started → session.tool.input.ended →
session.tool.called → session.step.streamed → session.tool.success → session.step.ended` and a
second `session.step.*` round.

## 4. MCP payload, verified the hard way

At runtime `mcp.status.changed.data.server` is the changed server's **name as a string**
(`"context7"`), not an object and not an array: three successive probes assumed object, array and
string. It carries no status, so the plugin treats it as a trigger and re-queries `ctx.mcp.list()`.

Two further limits were measured:

- `ctx.mcp.list()` returned `{ data: [] }` in the standalone run until a server changed; the first
  real statuses arrived after the first `mcp.status.changed`.
- NDJSON v1 and the firmware radar accept at most **8** server entries. The bridge keeps the true
  `online`/`total` counts and sends the eight most useful entries (connected first); 12 configured
  servers therefore show as `7 online / 12` with eight dots.

## 5. Deliberately ignored events

| Event | Why |
| --- | --- |
| `session.text.delta`, `session.text.ended` | carries response content; only the state transition is used |
| `session.reasoning.delta`, `session.step.streamed` | content, no state value |
| `session.tool.input.delta/ended` | tool arguments, never forwarded |
| `session.tool.progress` | metadata can carry paths; no state value |
| `session.inbox.*`, `session.renamed`, `session.viewed` | prompt text and titles |
| `filesystem.changed`, `file.edited`, `vcs.branch.updated` | paths, no Buddy requirement |
| `session.usage.recorded` | auxiliary (title/compaction/generate) totals; adding it would double count with `usage.updated` |

## 6. Limits of this mapping

1. `session.execution.started` carries **no** `location`; it is accepted because the session is known
   from the snapshot or from a previous located event. A session that appears only through
   location-less events and was never listed would be dropped — acceptable, never wrong.
2. THINKING and GENERATING are derived from step and first-token markers, not from reasoning tokens.
   A model that emits no reasoning still shows THINKING while the step is prepared. This is a
   documented approximation, not simulated activity.
3. A tool shorter than the 1 s state interval may never be visible as WORKING on the panel; it is
   still counted. Verified with a 6 ms tool: the counter moved, the screen did not.
