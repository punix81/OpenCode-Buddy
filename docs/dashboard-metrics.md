# Dashboard metrics

Date: 2026-11-26
Status: Phase 4 implementation. Values are **VERIFIED** against the bridge/plugin code and the OpenCode
2.4.1 session API where stated; hardware legibility is **NOT VERIFIED** until the Phase 4 firmware is
flashed with owner approval.

## 1. Scope and focus session

The bridge reduces every OpenCode location into one snapshot. The device never aggregates sessions
itself:

- `activeSessions` counts every session whose effective status is active across all peers.
- Pending permissions and questions are summed across all sessions; they are the only
  cross-session counters.
- Model, agent, execution duration, tokens, tools and MCP totals describe exactly one **focus
  session**. At equal priority the most recently active session wins (verified by
  `the most recently active session wins at equal priority`).
- A session belongs to one OpenCode peer; another peer's disconnect cannot change it.

| Dashboard value | Source | Status |
| --- | --- | --- |
| Execution status | `execution.*`, `phase`, `session.idle`, reducer priority | VERIFIED |
| Model / agent | `session.step.started`, selection, snapshot | VERIFIED |
| Execution duration | Bridge monotonic timestamps (`startedAt`, `terminalAt`) | VERIFIED |
| Active sessions | Reducer over the registry | VERIFIED |
| Pending permissions / questions | Request-ID sets, API sync, derived interaction state | VERIFIED |
| Retry attempt | `session.retry.scheduled` | VERIFIED |
| Tokens | `session.usage.updated`, max per field per session | VERIFIED |
| Tool counters | `session.tool.*`, deduplicated by call ID | VERIFIED |
| MCP totals / details | Plugin `ctx.mcp.list()`, bridge alias map | VERIFIED |
| Versions | Bridge constants, plugin IPC hello, device build | VERIFIED |
| OpenCode version | Plugin IPC hello, optional protocol capability | VERIFIED in tests; not yet observed on the Phase 4 firmware (not flashed) |

## 2. Execution duration

The chronometer is **not** the session lifetime:

- Active execution: `now - startedAt`.
- Terminal state (`success`, `error`, `interrupted`): frozen at `terminalAt - startedAt` for the
  notification TTL.
- Idle/offline or after the TTL: zero.
- A restart/phase seen without `execution.started` starts the chronometer at the first trace.
- A reconnect snapshot restores the start from `Session.Info.time.busy`, so the timer continues
  truthfully after a link loss instead of restarting at zero.

Tests: `elapsed time runs while the execution is active`, `elapsed time freezes on the terminal
duration, then reads zero`, `a phase seen without execution.started starts the chronometer`,
`a new execution after idle restarts the chronometer`, `interruption freezes the duration for its
notification, then clears it`, plus the plugin snapshot tests.

## 3. Tokens

The device displays the focus session's **cumulative** provider counters, as verified against the
OpenCode API in Phase 3.1 (bridge = `GET /api/session` exactly, no aggregation).

- `IN` and `OUT` are the maximum cumulative values seen in the session.
- `SESSION TOTAL = IN + OUT` when both are known. The label says **SESSION TOTAL** so it cannot be
  read as a context measurement.
- Input/output are each bounded to uint32 by protocol v1. When the wide sum exceeds 4294967295, the
  bridge omits `total`; the firmware derives the 64-bit sum from the two operands. This avoids an
  understated total next to larger IN/OUT values.
- Unknown counters stay `--`; a missing operand makes the total unknown rather than zero.
- Compact formatting: `18.4k`, `4.3M`, `8.6B` (rounded to one decimal, SI-style k/M/B). Values below
  1000 stay integers.

**Reasoning and cache.** The plugin reads `tokens.reasoning`, `tokens.cache.read` and
`tokens.cache.write` for diagnostics but they are not part of NDJSON v1 and are not displayed. They
are never added to `SESSION TOTAL`. Their overlap with `input` is provider-dependent (a cached prompt
may be counted inside input by some providers); that semantic is **NOT VERIFIED** for the current
provider, so counting them would risk a double count.

**Context.** Current context occupancy and model context capacity are **not available** from the
verified event/API surface. The cumulative token counters are not occupancy. The device therefore
keeps `CTX --`; no percentage, quota or billing value is invented. `tokens.contextPct` remains in the
protocol for future compatible use, but the bridge currently always emits `null`; a reducer test
asserts that cumulative tokens never become a percentage.

## 4. Tools

The focus session's tool calls are deduplicated by `(messageId, toolId)`:

- `Done`, `Failed`, `Running` are balanced: a start increments running, one outcome decrements it and
  increments success/failed; duplicate outcomes are ignored.
- An outcome without a known start still counts in success/failed but never fabricates a running
  call.
- Categories are `Read`, `Edit`, `Shell`, `Search`, `MCP`, `Other`. OpenCode v2 does not expose an
  authoritative category field in the events the plugin consumes; the category is derived from the
  tool name announced on `session.tool.input.started` (`categoryFor`). This is the only verified
  metadata available, and the rule table is covered by plugin tests with real tool names. A future
  OpenCode field would replace the convention without a protocol change.
- Tool arguments, commands, paths and output never leave the plugin and are never displayed.

## 5. MCP radar

- `online` and `total` come from the complete plugin list and are carried in both `state.mcp` and
  `mcp_status`; totals may exceed the detail list (255 max).
- The radar draws at most eight detail entries. When `total > count`, the screen shows `n/total
  shown` (localized) in addition to the aggregate; this is the only indicator that the graphical
  subset is incomplete.
- Aliases are stable per bridge run (`MCP-1…MCP-16`). Real names are disabled unless the local
  configuration explicitly sets `allowRealMcpNames: true`.
- Status classes: connected, pending, disabled, failed, needs auth, unknown. Connected entries use
  the inner orbit and a filled dot; every other class uses its own square colour on the outer orbit.
- The MCP frame is sent on its own tick and only when it changes; it never shares the state burst.

## 6. System

Displayed only when known; an unavailable value is `--`, never `OK`:

| Row | Source |
| --- | --- |
| USB host | Device CDC connection state |
| Bridge | Bridge `ready`/`degraded` |
| OpenCode | Plugin IPC presence |
| OpenCode version | Optional `versions.opencode`, capability `state.opencodeVersion` |
| Firmware | Compiled-in version |
| Bridge version | `ready`/`state` versions |
| Protocol | Negotiated major (`v1`) |
| Diagnostic | Last protocol error code, `DIAG <code>` |

The OpenCode version is the peer's `appVersion` from the IPC hello, bounded to 16 characters and
sanitized by the privacy filter. It is omitted for a firmware that does not advertise the capability,
so older firmware keeps working.

## 7. Footer and data source

The footer answers "where does this come from?" and "is it current?":

- `LIVE`: live data, bridge ready, OpenCode connected.
- `MOCK`: simulated data from the explicit mock source (or the preview fixture).
- `OFFLINE`: no live data (USB/bridge/OpenCode not available); the state label says `Offline`
  (`Hors ligne`, `Offline`).
- `STALE`: a retained terminal snapshot whose producer is gone; non-Buddy screens also show
  `LAST SNAPSHOT`.
- `QUIET`/`STUMM`/`SILENCE` and the notification count are appended after `/` when active.

## 8. Not displayed

Prompts, responses, reasoning text, tool arguments, commands, file paths, project names, session
IDs, request IDs, MCP real names by default, credentials, internal hostnames and addresses.
