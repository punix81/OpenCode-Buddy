# Architecture — OpenCode Buddy

Status: Phase 0 design baseline. Nothing below is implemented yet; the audit evidence and the
OpenCode API surface it relies on are recorded in `docs/opencode-api-audit.md`.

## 1. System context

```text
┌──────────────────────────── the developer's machine ────────────────────────────┐
│                                                                                 │
│  OpenCode v2 background server  (CLI / TUI / Desktop all attach to it)          │
│        │  in-process plugin API: event stream, session, permission, mcp, tools   │
│        ▼                                                                         │
│  Buddy plugin (@opencode/plugin)                                                 │
│        │  allowlisted normalized events, loopback IPC only                       │
│        ▼                                                                         │
│  Buddy bridge (Node.js / TypeScript)                                             │
│        │  state reducer + metrics + privacy filter + protocol codec              │
│        │  USB CDC, versioned NDJSON                                              │
└────────┼────────────────────────────────────────────────────────────────────────┘
         ▼
   ESP32-C3 firmware            serial → protocol → state → screens → animations
         │
         ├── GC9A01 240 × 240 (SPI)
         └── TTP223 (GPIO6) → gestures → screen navigation, quiet mode
```

Two hard properties shape every decision:

1. **The device is optional.** OpenCode must behave identically when the plugin, bridge or device is
   missing. No synchronous waits, no exceptions escaping into the agent loop, bounded work per event.
2. **The device is a sink.** It receives normalized state and counters. It cannot approve, execute or
   read anything. Its only outputs are gestures and protocol control messages.

## 2. Components

### 2.1 Plugin (`plugin/`)

| Component | Responsibility |
| --- | --- |
| `PluginEntry` | `Plugin.define`, lifecycle, cleanup, option parsing. |
| `OpenCodeAdapter` | Subscribes with `ctx.event.subscribe`, maps OpenCode v2 events to normalized events; uses `ctx.session`, `ctx.permission`, `ctx.mcp` for snapshots. |
| `EventClassifier` | Classifies tool calls (read / edit / shell / search / mcp / other) from the tool ID only. |
| `PrivacyGate` | First allowlist filter: drops anything not explicitly normalized; never forwards raw payloads. |
| `BridgeLink` | Loopback-only client to the bridge, bounded queue, drop-oldest policy, reconnect with backoff. |

The plugin runs inside the OpenCode server, so it needs no HTTP authentication and no scraping. It
must never throw into the host: every handler is wrapped, failures are counted and logged sanitized.

### 2.2 Bridge (`bridge/`)

| Component | Responsibility |
| --- | --- |
| `OpenCodeAdapter` (interface) | Source of normalized events: plugin link, mock, or future alternatives. |
| `EventNormalizer` | Second allowlist filter, schema validation, length limiting, enum clamping. |
| `SessionRegistry` | Per-session state machines, activity timestamps, identity of in-flight tool calls. |
| `StateReducer` | Deterministic aggregate state from all sessions (see §4). |
| `MetricsManager` | Token and tool counters with deduplication and out-of-order protection. |
| `SerialTransport` | Port open/close, line framing, backpressure, reconnect, heartbeat, timeouts. |
| `DeviceDiscovery` | Enumerates candidate USB CDC ports by VID/PID and manual override; never opens blindly. |
| `ConfigurationManager` | Loads `config.local.json`, validates, applies defaults, no secrets in logs. |
| `PrivacyFilter` | Final outbound filter and field whitelist for protocol payloads. |
| `MockAdapter` | Scripted event sequences for development without OpenCode or hardware. |
| `DiagnosticLogger` | Sanitized structured logs, optional protocol trace without content. |

### 2.3 Firmware (`firmware/`)

| Component | Responsibility |
| --- | --- |
| `SerialManager` | USB CDC read/write, bounded line buffer, overflow discard. |
| `ProtocolParser` | NDJSON parse (ArduinoJson), version and type dispatch, safe rejection. |
| `StateManager` | Holds normalized device model, applies config, tracks staleness. |
| `DisplayManager` | LovyanGFX device, partial refresh regions, sprite lifecycle. |
| `ScreenManager` | Six screens, layout helpers, circular safe area, transitions. |
| `BuddyFace` | Procedural face: eyes, mouth, expressions shared across states. |
| `AnimationEngine` | Frame scheduling, easing, per-state animation clips, 20–30 FPS. |
| `TouchManager` | Debounced gesture state machine (short, double, long, very long). |
| `PreferencesManager` | NVS persistence: language, quiet mode, last screen. |

The firmware knows nothing about OpenCode. It consumes a normalized status enum and counters.

## 3. Data flow and event mapping

OpenCode v2 exposes a rich, durable event stream (verified: 101 event variants in the 2.4.1 OpenAPI
document). Mapping used by the reducer:

| OpenCode event | Normalized signal |
| --- | --- |
| `session.execution.started` | session busy, execution timer starts |
| `session.step.started` | phase = step started (agent, model available) |
| `session.reasoning.started/delta/ended` | phase = reasoning |
| `session.text.started/delta/ended`, `session.step.streamed` | phase = generating |
| `session.tool.called`, `session.tool.progress` | tool running (+ category) |
| `session.tool.success` | tool success counter, phase back to working |
| `session.tool.failed` | tool failed counter; not an execution failure |
| `session.retry.scheduled`, `session.status` (`retry`) | retry with attempt number |
| `session.compaction.started/ended/failed` | compacting |
| `session.execution.succeeded` | success notification (temporary) |
| `session.execution.failed` | failure with structured error type |
| `session.execution.interrupted` | interrupted with reason |
| `session.usage.updated` | token and cost snapshot |
| `permission.asked` / `permission.replied` | pending permission count |
| `form.created` / `form.replied` / `form.cancelled` | pending user input count (assumption: v2 forms are user questions; confirmed in Phase 3) |
| `mcp.status.changed` | MCP status needs refresh |
| `session.idle` | session idle; drop from active set after grace period |

Aggregation rule: one aggregate state derived from per-session states using the priority in §4; the
session that produced the winning state is the "focus session" shown on the Session screen.

### Snapshot strategy

The plugin seeds the registry at startup (`ctx.session.list`, `ctx.mcp.list`, `ctx.permission.list`),
so the first frame is correct without waiting for events, and re-seeds after a bridge reconnect.

## 4. State reduction

Connection state and execution state are **separate** fields; never conflated.

```text
ConnectionState: offline | connecting | ready | degraded   (bridge/device link)
ExecutionState : idle | thinking | generating | working | permission_required |
                 user_input_required | success | error | compacting | retrying | interrupted
```

Priority (highest first), reviewed against v2 semantics:

| # | State | Rationale |
| --- | --- | --- |
| 0 | `offline` | Device-side connection banner; not an execution state. |
| 1 | `permission_required` | Blocks the agent until a human acts. Outranks every execution state. |
| 2 | `user_input_required` | Same blocking property (v2 forms / questions). |
| 3 | `error` | A failed execution needs attention and must not be masked by a retry of another session. |
| 4 | `retrying` | Active recovery; more informative than idle but non-blocking. |
| 5 | `compacting` | Distinct, brief, user-relevant transformation of context. |
| 6 | `working` | A tool is executing. |
| 7 | `thinking` | Reasoning phase. |
| 8 | `generating` | Response streaming. |
| 9 | `success` | Temporary confirmation (default 4 s), replaced by any higher state. |
| 10 | `interrupted` | Neutral warning, shown after the execution ends. |
| 11 | `idle` | Nothing running. |

Notes:

- `thinking` before `generating` in the table is deliberate: within one step, reasoning is the more
  specific signal while it lasts; both are below tool execution because a running tool is the more
  concrete activity.
- `success` is a *notification*: it must not survive a new execution start. It is timestamped and
  expires; it also never overrides `permission_required`.
- A tool failure increments counters and shows a brief error accent but must not put the whole
  companion into `error`; only `session.execution.failed` does.
- Terminal states (`success`, `error`, `interrupted`) are **session-scoped notifications**, not
  persisting states. Each expires after a bounded TTL — `success` 4 s, `interrupted` 10 s, `error`
  30 s, all configurable — or when that same session starts a new execution, whichever happens
  first. Without an expiry, one failure could mask another session's live activity for the rest of
  the day and the device would stop reporting reality; that is why the TTL is part of the reducer
  contract, not a display detail.
- A permission or question prompt does **not** expire on a timer: it disappears only when the
  corresponding `permission.replied` / `form.replied` / `form.cancelled` event arrives, because the
  blocking condition really is still present.
- Counters are monotonic per session and are deduplicated by `(sessionID, assistantMessageID, toolID)`
  for tools and by taking the **maximum** cumulative token snapshot per session (v2 reports usage as
  a snapshot, not a delta — assumption to confirm in Phase 3).

Priority is a pure function, unit-tested with table-driven cases including concurrency.

## 5. Protocol (summary)

Versioned NDJSON over USB CDC, one UTF-8 JSON object per line, 2048 bytes maximum. Full
specification: `protocol/protocol-v1.md`.

- Message types: `hello`, `ready`, `config`, `state`, `mcp_status`, `heartbeat`, `ack`, `interaction`,
  `resync`, `error`.
- Each direction has its own monotonically increasing `seq`; a gap triggers `resync` and a full
  snapshot.
- Version negotiation picks the highest common major version; incompatible peers surface an explicit
  error instead of degraded guessing.
- Unavailable values are `null` or omitted, never zero.

## 6. Failure modes

| Failure | Expected behaviour |
| --- | --- |
| OpenCode server down | Plugin unloads; bridge marks OpenCode offline; device shows OFFLINE; bridge keeps running. |
| Bridge down | Plugin drops events with a bounded queue; OpenCode unaffected; plugin reconnects with backoff. |
| Device unplugged mid-write | Write error is caught; port closed; reconnect loop; heartbeat timeout; snapshot on return. |
| Device reboots | Device sends `hello`; bridge replies `ready` + full snapshot; sequence numbers reset. |
| Malformed line | Rejected, counted, logged sanitized; no reboot, no parser desync (discard to newline). |
| Clock jumps / out-of-order events | Sequence and monotonic counters dominate; wall clock only for display durations. |
| Two sessions emitting different states | Priority function picks one deterministically; ties broken by session creation time. |
| Port owned by another process | Explicit error naming the port in use; no retry storm; actionable message. |

## 7. Architectural decisions

| ID | Decision | Alternatives rejected | Why |
| --- | --- | --- | --- |
| ADR-001 | Native `@opencode/plugin` server plugin as the primary source | HTTP polling of `/api/event`; log tailing; scraping the TUI | In-process, typed, no auth handling, no polling load, richest data, survives client choice. |
| ADR-002 | Local bridge as a separate process | Plugin writes to serial directly | Keeps USB/OS concerns and reconnection logic out of OpenCode's process; allows mock mode, diagnostics and a stable protocol boundary. |
| ADR-003 | NDJSON over USB CDC | Binary framing; JSON with length prefixes | Matches the proven reference implementation, human-inspectable, trivially recoverable after corruption (newline resync). |
| ADR-004 | LovyanGFX + GC9A01 panel driver, PlatformIO | TFT_eSPI; Arduino IDE only | Library already proven with this exact panel and pins; PlatformIO gives reproducible pinned builds. |
| ADR-005 | 8-bit full-frame sprite with dirty regions where possible | Full 16-bit double buffer | 240×240×1 B = 57.6 kB fits comfortably; 16-bit would double memory and risk fragmentation. |
| ADR-006 | Firmware independent of OpenCode semantics | Firmware parses OpenCode events | Normalization stays in TypeScript where iteration is cheap; firmware stays stable and testable. |
| ADR-007 | Loopback HTTP/IPC between plugin and bridge, bound to 127.0.0.1 | Named pipe only; unix socket only | Works on Windows and Linux with one code path; must bind loopback explicitly and never 0.0.0.0. |
| ADR-008 | Alias MCP server names by default | Always show real names | Avoids leaking internal tooling names on a desk device in shared spaces; opt-in to real names. |
| ADR-009 | Quiet mode in firmware, driven by config | Bridge stops sending events | Device stays responsive and can still show alerts; bridge remains the single source of truth for state. |

## 8. Resource budget

| Resource | Budget | Basis |
| --- | --- | --- |
| Flash | ≤ 1.5 MB of 4 MB | **Measured Phase 1: 349 154 B (26.6 % of the 1 310 720 B app partition), image 378 336 B.** |
| Static RAM | ≤ 180 kB of ~320 kB usable | **Measured Phase 1: 16 316 B static. Plus the 48 400 B canvas allocated at boot, roughly 65 kB at runtime.** |
| Frame time | ≤ 50 ms (20 FPS floor), target 33 ms | Not measured: requires the panel. Design budget only. |
| Protocol line | 2048 B hard cap | Fits the largest snapshot with MCP list (bounded to 12 entries by alias and truncation). |
| Bridge RSS | < 100 MB | Node baseline + serial + small caches. |

## 9. Open design questions (Phase 1–3)

1. Does `form.created` represent the user-question flow on all clients? (Phase 3)
2. Is `session.usage.updated` cumulative per session or per message? (Phase 3)
3. Which `Model.Info.limit.context` value is authoritative for the context percentage? (Phase 3)
4. Can the 27 MHz SPI clock sustain 30 FPS with partial refresh on this panel? (Phase 1 measurement)
5. Is GPIO0 usable as display reset without boot-strap interference in practice? (reference works;
   confirm on our unit in Phase 1)
