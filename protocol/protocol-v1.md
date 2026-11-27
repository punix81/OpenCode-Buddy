# USB protocol v1 — RATIFIED

Status: **RATIFIED v1** (2026-11-24). Decisions and defect resolutions: `ratification-v1.md`.
Firmware and bridge must both implement this document; the JSON Schema and the test vectors are
normative.

## 1. Goals

- Human-inspectable framing that survives corruption.
- Deterministic recovery after device reset, bridge restart or cable re-plug.
- Explicit representation of unavailable data.
- Hard bounds so a hostile or buggy peer cannot exhaust memory.
- Version negotiation instead of silent incompatibility.
- One owner per field: no peer reports what it cannot observe.

## 2. Framing

- UTF-8, one JSON object per line, `\n` terminated. `\r` is ignored.
- Maximum line length: **2048 bytes including the newline**. Longer input is discarded up to the next
  newline and reported with `E_TOO_LONG`; the connection stays open.
- No binary frames, no image data: the device renders everything locally.
- Serial parameters: 115 200 baud, 8N1, no flow control. The ESP32-C3 native USB CDC ignores the rate,
  but hosts expect a value.

## 3. Envelope

```json
{ "v": 1, "type": "state", "seq": 42, "ts": 1795514489854, "data": { } }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `v` | integer | yes | Protocol major. Current: `1`. |
| `type` | string | yes | One of the ten message types. |
| `seq` | integer ≥ 1 | yes | Per sender, per connection, starting at 1. |
| `ts` | integer | no | Sender clock in epoch ms. Advisory only. |
| `data` | object | yes except `heartbeat` | Type-specific payload. |
| `id` | string ≤ 24 | no | Correlation identifier for request/ack pairs. |

Unknown top-level fields are ignored. Unknown `type` values are rejected with `E_UNKNOWN_TYPE` and do
not break the session. Inside `data`, unknown fields are rejected (`additionalProperties: false`).

## 4. Message types

Direction: **D→B** device to bridge, **B→D** bridge to device.

### `hello` (D→B, seq = 1)

Sent on boot, after any detected restart, and repeatedly while no bridge session is established.
Opening the USB port does not reliably reset the board, so a bridge started after the device boot
would otherwise never see a handshake. While the bridge link is `unknown`, or after 6 s without a
valid bridge message, the device re-announces every 3 s and restarts its own sequence at 1. It only
announces while a USB host is attached, so no frames are buffered for a host that is not reading.

A bridge may ignore a `hello` that repeats the current `boot` counter within 2 s of the previous
handshake: that is a buffered duplicate, not a new session. A different `boot` always means a restart.

```json
{ "v": 1, "type": "hello", "seq": 1, "data": {
  "device": "opencode-buddy", "fw": "0.2.0", "proto": [1], "maxLine": 2048, "boot": 7 } }
```

`boot` is the device's reset-persistent boot counter, used by the bridge to detect a restart even if
USB re-enumeration is missed. `proto` is the set of supported majors. `caps` is an optional array of at
most eight capability strings:

- `config.partial`: the device accepts a `config` without `language`/`quietMode` and keeps its stored
  preference.
- `state.opencodeVersion`: the device accepts the optional `versions.opencode` string in a `state`
  snapshot and can display it.

A firmware that sends no `caps` needs the legacy `config` fields and rejects unknown keys in
`versions`; the bridge keeps sending the legacy config and omits the optional version.

### `ready` (B→D, seq = 1)

Reply to a valid `hello`. It announces the negotiated major and the bridge run identity, then the
bridge sends `config`, a full `state` snapshot and `mcp_status`.

```json
{ "v": 1, "type": "ready", "seq": 1, "data": {
  "bridge": "0.2.0", "proto": 1, "run": "8f2c1a4b" } }
```

`run` is a random bridge run identifier (≤ 8 hex characters). It is **not** an OpenCode session ID and
must never be derived from user data.

### `config` (B→D)

Device preferences and gesture timings. Sent after `ready` and whenever they change.

```json
{ "v": 1, "type": "config", "seq": 2, "data": {
  "language": "en", "quietMode": false, "autoReturnSeconds": 60,
  "gestures": { "debounceMs": 35, "doublePressWindowMs": 350,
                "longPressMs": 1500, "veryLongPressMs": 5000 },
  "source": "live" } }
```

`language` and `quietMode` are optional. When a field is absent, the device keeps its stored
preference: the device owns the display preferences, and the host overrides one only when it sends it
explicitly. This keeps quiet mode and language across a USB reconnection or a bridge restart.

Bounds: `debounceMs` 10–200, `doublePressWindowMs` 150–800, `longPressMs` 800–3000,
`veryLongPressMs` 3000–10000, `autoReturnSeconds` 10–600. Out-of-range values are clamped and
reported with an `E_BOUNDS` warning in the next `ack`.

### `state` (B→D)

Complete snapshot, never a delta. Idempotent: applying the same snapshot twice is harmless.

```json
{ "v": 1, "type": "state", "seq": 3, "data": {
  "status": "thinking",
  "model": "deepseek-v4.1-flash",
  "agent": "build",
  "activeSessions": 2,
  "elapsedSeconds": 272,
  "pendingPermissions": 0,
  "pendingQuestions": 0,
  "notifications": 0,
  "tokens": { "input": 15200, "output": 3200, "total": 18400, "contextPct": null },
  "tools": { "success": 21, "failed": 1, "running": 1,
             "categories": { "read": 9, "edit": 4, "shell": 3, "search": 2, "mcp": 2, "other": 1 } },
  "mcp": { "online": 10, "total": 12 },
  "connection": { "bridge": "ready", "opencode": "connected" },
  "versions": { "bridge": "0.2.0", "protocol": 1, "opencode": "2.4.1" },
  "source": "live",
  "diagnostic": { "code": "E_PARSE" } } }
```

Field ownership:

| Field | Owner | Notes |
| --- | --- | --- |
| `status`, `model`, `agent`, counters, tokens, tools, mcp, `source`, `diagnostic` | Bridge | Normalized from OpenCode; never raw content |
| `connection.bridge` | Bridge | `ready` or `degraded` from its own link view |
| `connection.opencode` | Bridge | `connected`, `offline` or `unknown` |
| `versions.bridge`, `versions.protocol` | Bridge | Bridge version and negotiated major |
| `versions.opencode` | Bridge | Optional, only with the `state.opencodeVersion` capability; version reported by the OpenCode peer over IPC |
| **USB link** | **Device** | The device derives it locally; it is never sent on the wire |
| **Firmware version** | **Device** | Compiled in; never imposed by the bridge |

`status` enum: `offline`, `idle`, `thinking`, `generating`, `working`, `permission_required`,
`user_input_required`, `success`, `error`, `compacting`, `retrying`, `interrupted`.

`tokens.total = input + output`; reasoning and cache are not included and are never counted twice. The
field is optional and bounded to uint32: when the wide sum exceeds 4294967295, the bridge omits `total`
and the device derives it from `input + output` in 64-bit, so a very large session cannot understate
its total. The
plugin and bridge keep the provider's `reasoning`, `cache.read` and `cache.write` counters internally
for diagnostics, but they do not travel in v1 and their overlap with `input` is provider-dependent and
not verified for the current provider. `contextPct` is `null` unless both a reliable current-context
occupancy and a reliable model capacity are known; the cumulative session counters are not a context
measurement. `notifications` is the number of unacknowledged user-visible alerts raised while the link
was connected, capped at 99.

`connection.opencode` adds `unknown` so "no data yet" is never confused with "offline".

Required: `status`, `activeSessions`, `connection`, `versions`, `source`. Other fields are optional;
absent means unavailable.

### `mcp_status` (B→D)

Sent after `ready`, on an MCP status refresh, and at most every 5 s.

```json
{ "v": 1, "type": "mcp_status", "seq": 4, "data": {
  "online": 10, "total": 12, "source": "live",
  "servers": [ { "alias": "MCP-1", "status": "connected" },
               { "alias": "MCP-7", "status": "needs_auth" } ] } }
```

`status`: `connected`, `pending`, `disabled`, `failed`, `needs_auth`. Aliases are stable within a
bridge run and may change after a restart. No URL, command, error text or real server name is included
unless real names are explicitly enabled, in which case `name` replaces `alias` and is sanitized to
20 characters.

### `heartbeat` (B→D and D→B)

Sent every 2 s. The peer declares the link down after 6 s without any valid message. It has no `data`.

```json
{ "v": 1, "type": "heartbeat", "seq": 5 }
```

### `ack` (both)

Acknowledges the last successfully applied peer `seq`.

```json
{ "v": 1, "type": "ack", "seq": 6, "data": { "ack": 3, "warning": null } }
```

- `data.ack` is the peer's sequence number that was applied; the envelope `seq` is the sender's own.
- Acks are advisory and may be coalesced. An `ack` is never itself acknowledged.
- `warning` is an optional error code describing a clamped or ignored value.

### `interaction` (D→B)

The only user-originated message. It never carries approval or content.

```json
{ "v": 1, "type": "interaction", "seq": 7, "data": {
  "gesture": "short", "screen": 3 } }
```

`gesture`: `short`, `double`, `long`, `very_long`. `screen` is the visible screen index 0–5. An invalid
index is `E_BOUNDS` and the interaction is dropped; the device never changes screen because of an
invalid value. The bridge may adjust non-security preferences; it can never approve a permission,
execute a command or modify source code.

### `resync` (D→B)

Requests a full snapshot after a sequence gap or an internal error.

```json
{ "v": 1, "type": "resync", "seq": 8, "data": {
  "reason": "seq_gap", "expected": 5, "received": 9 } }
```

`reason`: `seq_gap`, `parse_error`, `state_error`, `boot`. The bridge replies in this fixed order:
`config`, `state`, `mcp_status`, each with fresh `seq` values. The device applies them atomically.

### `error` (both)

```json
{ "v": 1, "type": "error", "seq": 9, "data": {
  "code": "E_PARSE", "fatal": false, "detail": "invalid json" } }
```

Codes: `E_PARSE`, `E_TOO_LONG`, `E_UNKNOWN_TYPE`, `E_VERSION`, `E_BOUNDS`, `E_SERIAL`, `E_INTERNAL`.
`detail` is a short, sanitized, non-user-derived string (max 48 chars). Never include payload content.

## 5. Connection and link states

Three independent notions must never be conflated:

| Layer | Values | Owner | How it is known |
| --- | --- | --- | --- |
| USB | `connected`, `disconnected` | Device | Local CDC observation only |
| Bridge link | `unknown`, `handshaking`, `ready`, `degraded` | Both | Handshake, heartbeats, 6 s timeout |
| OpenCode | `unknown`, `connected`, `offline` | Bridge | Protocol snapshot |

- `unknown` means "no information yet"; it is never rendered as `0` or as `connected`.
- `degraded` means USB is present but the peer missed the heartbeat window. The device keeps the last
  frame with a stale marker for at most 6 s, then shows `OFFLINE`.
- A new `hello` always starts a new bridge-link session: sequence numbers reset, aliases may change,
  and the bridge sends a full snapshot.

## 6. Session lifecycle

```text
device boot ── hello(seq=1) ──► bridge
                                │ version check
                                ├─ incompatible → error E_VERSION (fatal) → device shows unsupported
                                └─ compatible   → ready(seq=1) → config → state → mcp_status
heartbeats every 2 s in both directions
6 s silence → degraded → OFFLINE; bridge keeps retrying
```

- The device sends `hello` on every boot, including resets caused by a crash.
- The device also re-announces `hello` every 3 s while no bridge session is established and a USB
  host is attached, because connecting the USB port does not always reset the board. Each `hello`
  restarts the device-side sequence at 1.
- The bridge treats any `hello` as a new session: it resets its own `seq`, recomputes aliases and sends
  a full snapshot. A repeated `hello` with the same `boot` within 2 s is a buffered duplicate and is
  ignored without a new snapshot.
- The snapshot is split: `ready`, `config` and the `ack` go out immediately, `state` and `mcp_status` on
  the next tick. Sending all five back-to-back (~1.1 KB) overran the device's CDC RX queue and lost one
  frame per connection.
- The device never assumes state survives a reconnect; it shows `OFFLINE` after the timeout.

## 7. Sequence, ACK, duplicates and gaps

- Each sender starts at `seq = 1` with its first message on the connection (`hello` or `ready`).
- `seq` increases by exactly one per message sent.
- Receiver rules:

| Condition | Action |
| --- | --- |
| `seq == last + 1` | Apply, set `last = seq`, send an `ack` (coalesced) |
| `seq == last` | Duplicate: ignore silently, re-send an `ack` for `last` |
| `seq < last` | Stale: ignore, count it, optionally `ack` |
| `seq > last + 1` | Gap: send `resync`, drop messages until a full snapshot arrives |
| First message after `hello`/`ready` | Must be 1; anything else is a gap |

- Out-of-order messages are never applied. The snapshot is the only recovery path.
- Acks are not sequenced beyond the envelope rule; they carry `data.ack`.
- A duplicate `state` is idempotent; a duplicate `interaction` must not trigger a second action on the
  bridge (dedup by `(session, seq)` or by gesture timestamp).

## 8. Version negotiation

- Both peers advertise supported majors (`proto` in `hello`, `proto` in `ready`).
- The negotiated version is the highest common major.
- No common major: the bridge sends a fatal `error` with `E_VERSION`; the device displays
  `PROTOCOL UNSUPPORTED` and stops parsing. It stays alive and keeps accepting `hello`.
- Within one major, new optional fields and new message types may be added; unknown fields and types
  are ignored. Removing or re-typing a field requires a new major.

## 9. State model and transitions

The device keeps connection and execution state separate. Execution priority (highest first):

1. `offline` (link unavailable; device-side banner)
2. `permission_required`
3. `user_input_required`
4. `error`
5. `retrying`
6. `compacting`
7. `working`
8. `thinking`
9. `generating`
10. `success` (notification)
11. `interrupted`
12. `idle`

- Terminal states (`success`, `error`, `interrupted`) are session-scoped notifications with TTLs:
  success 4 s, interrupted 10 s, error 30 s, or until a new execution starts in that session.
- Permission and question prompts do not expire on a timer; they clear only on resolution.
- A tool failure increments counters and shows a transient accent; only an execution failure sets
  `error`.
- The bridge is the single source of the aggregate state; the device applies the snapshot verbatim
  after validation.

## 10. Unknown and unavailable values

- A number that is not known is `null`, never `0`.
- A string that is not known is `null` or omitted, never `""` or `"--"` on the wire.
- An enum that is not known is `unknown` where the enum defines it; otherwise the message is invalid.
- The device renders `--` (or `UNKNOWN`) for unavailable data and never invents a value.
- `activeSessions = 0` and `tools.success = 0` are legitimate known values.

## 11. Limits

| Field | Limit |
| --- | --- |
| Line | 2048 B including newline |
| `model` | 40 B UTF-8, printable Latin-1 |
| `agent` | 24 B UTF-8, printable Latin-1 |
| MCP `alias` | 12 B UTF-8, printable Latin-1 |
| `detail` | 48 B |
| Versions | 16 B |
| `run` | 8 hex chars |
| MCP servers | 8 per message (UI shows 3 + `+k MORE`) |
| Counters | uint32; sessions uint16; pending/notifications uint8 |

Out-of-range values are clamped where the field has a safe bound and reported with `E_BOUNDS`; an
invalid enum or type rejects the whole message and leaves the previous state untouched.

## 12. Error recovery

| Condition | Behaviour |
| --- | --- |
| Line > 2048 B | Discard to next newline, send `E_TOO_LONG`, continue |
| Invalid JSON | `E_PARSE`, continue |
| Unknown type | `E_UNKNOWN_TYPE`, continue |
| Value out of range | Clamp, report `E_BOUNDS` in the next `ack` |
| Unknown enum | Reject the message, keep previous state, report `E_BOUNDS` |
| Sequence gap | `resync`, drop until snapshot |
| Repeated failures (> 5 in 10 s) | Device shows `DEGRADED`; bridge slows to 1 message/s until a valid snapshot |
| Port cannot open | Exponential backoff 1, 2, 4, 8, 15 s (cap); no retry storm |
| Heartbeat timeout | `degraded`, then `OFFLINE`; snapshot on return |

Invalid input must never corrupt the current state: validate into a temporary object, then apply.

## 13. Compatibility rules

1. Adding an optional field is compatible within a major version.
2. Adding a new message type is compatible; peers ignore it if unknown.
3. Changing a field's type, removing a field, or changing an enum's meaning requires a new major.
4. Enum values are open on the receiving side: unknown values degrade gracefully, except where the
   state machine requires a known value (then the message is rejected).
5. The snapshot is always complete, so a missed message is never fatal.
6. `connection.usb` and `versions.fw` are **device-owned** and must not be sent by the bridge.

## 14. Size budget

| Message | Typical | Maximum design |
| --- | --- | --- |
| `state` | ~500 B | ~820 B |
| `mcp_status` | ~260 B | ~520 B |
| `config` | ~180 B | ~240 B |
| `heartbeat` | ~48 B | ~64 B |

A typical snapshot plus `config` and `mcp_status` is about 1.3 kB; the maximum design total is about
1.6 kB, leaving margin under the 2048 B cap.

## 15. Test vectors

Normative vectors live in `protocol/test-vectors/` and are consumed by both the TypeScript and the
firmware host tests. Examples live in `protocol/examples/` and are validated against the schema by
`npm run validate:protocol` from `bridge/`.

Vectors cover: valid messages, missing required fields, wrong types, unknown enum, out-of-range values,
invalid JSON, oversized lines, fragmented and concatenated input, duplicate/stale/gapped sequences,
version mismatch and invalid screen indices.
