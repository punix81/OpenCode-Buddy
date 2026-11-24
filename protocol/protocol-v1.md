# USB protocol v1 — design draft

Status: **DRAFT for review.** Ratified in Phase 2 before any implementation is merged. No code in this
repository consumes this specification yet.

## 1. Goals

- Human-inspectable framing that survives corruption.
- Deterministic recovery after device reset, bridge restart or cable re-plug.
- Explicit representation of unavailable data.
- Hard bounds so a hostile or buggy peer cannot exhaust memory.
- Version negotiation instead of silent incompatibility.

## 2. Framing

- UTF-8, one JSON object per line, `\n` terminated. `\r` is ignored.
- Maximum line length: **2048 bytes** including the newline. Longer input is discarded up to the next
  newline and reported with an `error` message; the connection stays open.
- No binary frames, no image data: the device renders everything locally.
- Serial parameters: 115 200 baud, 8N1, no flow control (the ESP32-C3 native USB CDC ignores the rate,
  but hosts expect a value; 115 200 matches the proven reference build).

## 3. Envelope

```json
{ "v": 1, "type": "state", "seq": 42, "ts": 1795514489854, "data": { } }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `v` | integer | yes | Protocol major version. Current: `1`. |
| `type` | string | yes | One of the ten message types. |
| `seq` | integer ≥ 0 | yes | Per-sender, per-connection monotonic counter, starting at 1 after `hello`. |
| `ts` | integer | no | Sender clock in epoch ms. Advisory only; never used for logic. |
| `data` | object | yes for all types except `heartbeat` | Type-specific payload. |
| `id` | string ≤ 24 | no | Correlation identifier for request/ack pairs. |

Unknown top-level fields are ignored. Unknown `type` values are rejected with `error` and do not break
the session.

## 4. Message types

Direction: **B→D** bridge to device, **D→B** device to bridge.

### `hello` (D→B)

Sent on boot, after reset, and after a detected link loss.

```json
{ "v": 1, "type": "hello", "seq": 1, "data": {
  "device": "opencode-buddy", "fw": "0.1.0", "proto": [1], "maxLine": 2048 } }
```

### `ready` (B→D)

Reply to a valid `hello`. Announces the negotiated version and immediately follows with `config` and a
full `state` snapshot plus `mcp_status`.

```json
{ "v": 1, "type": "ready", "seq": 7, "data": {
  "bridge": "0.1.0", "proto": 1, "session": "8f2c1a4b" } }
```

`bridge` is the bridge version reported on the System screen. `proto` is the negotiated major and is
echoed in later `state` snapshots as `versions.protocol`.

### `config` (B→D)

Device preferences and gesture timings. Sent after `ready` and whenever they change.

```json
{ "v": 1, "type": "config", "seq": 8, "data": {
  "language": "en", "quietMode": false, "autoReturnSeconds": 60,
  "gestures": { "debounceMs": 35, "doublePressWindowMs": 350,
                "longPressMs": 1500, "veryLongPressMs": 5000 } } }
```

Bounds: `debounceMs` 10–200, `doublePressWindowMs` 150–800, `longPressMs` 800–3000,
`veryLongPressMs` 3000–10000, `autoReturnSeconds` 10–600. Out-of-range values are clamped and a
`warning` code is reported in the next `ack`.

### `state` (B→D)

Full snapshot, not a delta. Idempotent: receiving the same `seq` twice is harmless.

```json
{ "v": 1, "type": "state", "seq": 42, "data": {
  "status": "thinking",
  "model": "deepseek-v4.1-flash",
  "agent": "build",
  "activeSessions": 2,
  "elapsedSeconds": 272,
  "pendingPermissions": 0,
  "pendingQuestions": 0,
  "tokens": { "input": 15200, "output": 3200, "total": 18400, "contextPct": null },
  "tools": { "success": 21, "failed": 1, "running": 1,
             "categories": { "read": 9, "edit": 4, "shell": 3, "search": 2, "mcp": 2, "other": 1 } },
  "mcp": { "online": 10, "total": 12 },
  "connection": { "usb": "connected", "bridge": "ready", "opencode": "connected" },
  "notifications": 0,
  "versions": { "fw": "0.1.0", "bridge": "0.1.0", "protocol": 1 },
  "diagnostic": { "code": "E_PARSE" } } }
```

`status` enum: `offline`, `idle`, `thinking`, `generating`, `working`, `permission_required`,
`user_input_required`, `success`, `error`, `compacting`, `retrying`, `interrupted`.

`versions` and `diagnostic` are optional. When present they feed the System screen; when absent the
device shows `--`. `versions.fw` is the firmware's own constant, `versions.bridge` is copied from the
bridge's `ready`, and `versions.protocol` is the negotiated major. `diagnostic.code` is one of the
`error` codes below and describes the last local fault; it never contains free text.

Unavailable numeric values are `null`, never `0`. Unknown enum values must be rendered as `offline`
with a diagnostic code, not guessed.

### `mcp_status` (B→D)

Sent after `ready`, on `mcp.status.changed`, and at most every 5 s.

```json
{ "v": 1, "type": "mcp_status", "seq": 43, "data": {
  "online": 10, "total": 12,
  "servers": [ { "alias": "MCP-1", "status": "connected" },
               { "alias": "MCP-7", "status": "needs_auth" } ] } }
```

`status`: `connected`, `pending`, `disabled`, `failed`, `needs_auth`. Aliases are stable per bridge run.
No URL, command, error text or real server name is ever included unless the user explicitly enables real
names, in which case `name` replaces `alias` and is sanitized to 20 characters.

### `heartbeat` (B→D and D→B)

Sent every 2 s. The peer declares the link down after 6 s without any valid message.

```json
{ "v": 1, "type": "heartbeat", "seq": 44 }
```

### `ack` (both)

Acknowledges a received `seq`.

```json
{ "v": 1, "type": "ack", "seq": 9, "data": { "ack": 42, "warning": null } }
```

### `interaction` (D→B)

The only user-originated message. It never carries approval or content.

```json
{ "v": 1, "type": "interaction", "seq": 10, "data": {
  "gesture": "short", "screen": 3 } }
```

`gesture`: `short`, `double`, `long`, `very_long`. `screen` is the screen index visible when the gesture
completed (0–5). The bridge logs it and may adjust non-security preferences; it can never approve a
permission, execute a command or modify source code.

### `resync` (D→B)

Requests a full snapshot after a sequence gap or an internal error.

```json
{ "v": 1, "type": "resync", "seq": 11, "data": { "reason": "seq_gap", "expected": 50, "received": 57 } }
```

`reason`: `seq_gap`, `parse_error`, `state_error`, `boot`. The bridge replies with `config`, `state` and
`mcp_status` using fresh `seq` values.

### `error` (both)

```json
{ "v": 1, "type": "error", "seq": 12, "data": {
  "code": "E_PARSE", "fatal": false, "detail": "invalid json" } }
```

Codes: `E_PARSE`, `E_TOO_LONG`, `E_UNKNOWN_TYPE`, `E_VERSION`, `E_BOUNDS`, `E_SERIAL`, `E_INTERNAL`.
`detail` is a short, sanitized, non-user-derived string (max 48 chars). Never include payload content.

## 5. Session lifecycle

```text
device boot ── hello ──► bridge
                          │ version check
                          ├─ incompatible → error E_VERSION (fatal) → device shows unsupported
                          └─ compatible   → ready → config → state → mcp_status
heartbeats every 2 s in both directions
6 s silence → link down → device shows OFFLINE, bridge closes and retries
```

- The device sends `hello` on every boot, including resets caused by a crash.
- The bridge treats any `hello` as a new session: it resets its `seq`, recomputes aliases, and sends a
  full snapshot.
- The device never assumes state survives a reconnect; it keeps showing the last frame with a stale
  marker for at most 6 s, then switches to OFFLINE.

## 6. Sequence handling

- Each sender increments `seq` by exactly one per message, starting at 1 after `hello`.
- Receiver verifies `seq == last + 1`:
  - equal to `last` → duplicate, ignore silently;
  - less than `last` → stale, ignore and count;
  - greater than `last + 1` → gap: send `resync` and keep the newest message buffered, or drop it and
    wait for the snapshot (device and bridge agree on the latter for simplicity).
- `ack` carries the last successfully applied `seq`; acks are advisory and may be coalesced.

## 7. Version negotiation

- Both peers advertise a set of supported majors (`proto` in `hello`, `proto` in `ready`).
- The negotiated version is the highest common major.
- No common major: the bridge sends a fatal `error` with `E_VERSION`; the device displays
  `PROTOCOL UNSUPPORTED` on the System screen and stops parsing. It stays alive and keeps accepting
  `hello`, so a firmware update or a downgrade recovers without a power cycle.
- Within one major, new optional fields and new message types may be added; unknown fields and unknown
  types are ignored. Removing or re-typing a field requires a new major.

## 8. Error recovery and bounds

| Condition | Behaviour |
| --- | --- |
| Line > 2048 bytes | Discard to next newline, send `E_TOO_LONG`, continue. |
| Invalid JSON | Send `E_PARSE`, continue. |
| Unknown type | Send `E_UNKNOWN_TYPE`, continue. |
| Value out of range | Clamp to the nearest bound, report a warning in the next `ack`. |
| Unknown enum | Fall back to `offline` for `status`, keep raw value out of the UI, report `E_BOUNDS`. |
| Repeated failures (> 5 in 10 s) | Device shows `DEGRADED`, bridge logs and slows to 1 message/s until a valid snapshot arrives. |
| Bridge cannot open the port | No retry storm: exponential backoff 1, 2, 4, 8, 15 s (cap). |

## 9. Backward compatibility rules

1. Adding an optional field is compatible within a major version.
2. Adding a new message type is compatible; peers must ignore it if unknown.
3. Changing a field's type, removing a field, or changing an enum's meaning requires a new major.
4. Enum values are open on the receiving side: unknown values must degrade gracefully.
5. The snapshot is always complete, so a missed message is never fatal.

## 10. Size budget

| Message | Typical | Maximum design |
| --- | --- | --- |
| `state` | ~500 B | ~820 B |
| `mcp_status` | ~260 B (12 aliases) | ~520 B |
| `config` | ~180 B | ~240 B |
| `heartbeat` | ~48 B | ~64 B |

A typical snapshot plus `config` and `mcp_status` is about 1.3 kB; the maximum design total is about
1.6 kB, leaving margin under the 2048 B cap.

## 11. Test vectors

See `protocol/examples/` for canonical messages and `protocol/schemas/protocol-v1.schema.json` for the
machine-readable contract. Phase 2 adds: round-trip tests, boundary tests at 2047/2048/2049 bytes,
fuzzed parser input, sequence-gap scenarios, version-mismatch scenarios and device-reset scenarios.
