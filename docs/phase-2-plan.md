# Phase 2 plan — USB protocol, bridge and simulator

Status: **planned; not started.** Implementation begins only after explicit Product Owner approval.
Phase 2 does not integrate OpenCode (Phase 3) and does not change the dashboard (Phase 4).

## 1. Goal

Make the link between host and device trustworthy: a ratified protocol, a firmware parser that
survives hostile input, a TypeScript bridge that aggregates and filters events, and a simulator that
lets both sides be tested without hardware.

Exit condition: handshake, snapshot on reconnect, sequence-gap resync, oversized/malformed rejection,
and a long link soak with simulated resets, all with reproducible evidence.

## 2. Scope

In scope:

- Ratify protocol v1 and freeze its schema and examples.
- Firmware: NDJSON parser, message handlers, state application, heartbeat, ack, resync, error.
- Bridge: TypeScript/Node application with the component set from `docs/architecture.md`.
- Mock adapter and a device simulator.
- Diagnostics and sanitized protocol tracing.
- Protocol, unit and integration tests; a link soak.

Out of scope:

- OpenCode plugin and event mapping (Phase 3).
- Real MCP/tool/token data (Phase 3); the bridge consumes normalized events.
- Dashboard changes and translations (Phase 4).
- Packaging and installers (Phase 6).

## 3. Prerequisites

- Phase 1 accepted (PASS WITH RESERVATIONS) and the device restored.
- Node.js 22+ available; TypeScript strict.
- PlatformIO local environment and esptool 5.7.0 documented.
- Reference bridge stopped while the Buddy bridge owns the port.
- No remote GitHub operations; the Product Owner handles publication.

## 4. Workstreams

### 4.1 Protocol ratification

Resolve and freeze the open points before writing handlers:

| Point | Proposed decision |
| --- | --- |
| Framing | UTF-8 NDJSON, `\n`, `\r` ignored, 2048 B including newline |
| Serial | 115 200 nominal, 8N1, no flow control (native USB CDC ignores rate) |
| Envelope | `v`, `type`, `seq`, optional `ts`, `data`, optional `id` |
| Sequence | per sender, per connection, +1 after `hello`; duplicate ignored, gap → `resync` |
| Version | major integer set; highest common major; no common → fatal `E_VERSION` |
| Snapshot | `state` is complete and idempotent; includes `versions` and optional `diagnostic` |
| Unavailable values | `null`, never `0`; unknown enum → `offline` + diagnostic |
| Heartbeat | every 2 s; link down after 6 s |
| Bounds | every numeric field clamped; strings truncated and sanitized |
| Unknown fields | ignored at envelope level; rejected inside `data` when the schema says closed |
| Unknown types | `E_UNKNOWN_TYPE`, connection stays open |
| Interaction | gestures only; no approval, command or file operation exists in the protocol |
| Errors | `E_PARSE`, `E_TOO_LONG`, `E_UNKNOWN_TYPE`, `E_VERSION`, `E_BOUNDS`, `E_SERIAL`, `E_INTERNAL` |

Deliverables: final `protocol/protocol-v1.md`, schema, canonical examples, a test-vector table, and a
decision log for every change from the Phase 0 draft.

### 4.2 Firmware

Add `ProtocolParser` and wire it to `SerialManager`:

- Read complete lines from the bounded buffer; never parse partial input.
- Parse with ArduinoJson 7.4.3 (new dependency, justified by the protocol) into a bounded document.
- Validate envelope, version, type and field types; reject with the correct error code.
- Apply `state` atomically: validate everything, then copy into `StateManager`.
- Handle `config` (timings, quiet, language), `mcp_status`, `heartbeat`, `ack`, `resync`, `error`.
- Send `hello` on boot, `ack` for applied snapshots, `heartbeat` every 2 s, `interaction` on gestures.
- Detect link loss at 6 s, show `OFFLINE`, and request a snapshot on return.
- Keep `BUDDY_DIAGNOSTICS` and `BUDDY_BENCH_COMMANDS` off in the release build; the protocol replaces
  them. Diagnostics become an explicit bridge command, not free-form serial text.

Memory rules: no per-message heap growth in steady state; measure the JSON document high-water mark
and the largest contiguous block; reject before allocating beyond the line bound.

### 4.3 Bridge

TypeScript/Node, strict mode, ESM, small modules:

| Component | Responsibility |
| --- | --- |
| `Transport` (interface) | Byte stream abstraction: serial or socket. |
| `SerialTransport` | Port open/close, framing, backpressure, reconnect, heartbeat, timeout. |
| `SocketTransport` | Simulator and tests without hardware. |
| `DeviceDiscovery` | Candidate ports by VID/PID, manual override, never opens blindly. |
| `ProtocolCodec` | Encode/decode envelopes, bounds, version negotiation, sequence handling. |
| `EventNormalizer` | Validate normalized events, clamp enums and sizes. |
| `SessionRegistry` | Per-session state, timers, dedup keys. |
| `StateReducer` | Deterministic aggregate state and priority (shared rules with firmware). |
| `MetricsManager` | Token/tool counters, dedup, out-of-order protection. |
| `PrivacyFilter` | Final allowlist projection before serialization. |
| `ConfigurationManager` | `config.local.json`, defaults, validation, no secrets in logs. |
| `MockAdapter` | Scripted event sequences without OpenCode or hardware. |
| `DiagnosticLogger` | Sanitized structured logs and protocol trace without content. |
| `ControlServer` | Loopback-only control API for simulator and diagnostics. |

Dependencies: `serialport` (runtime, pinned; verify prebuilds on Windows/Linux), `typescript` and a
test runner (dev). Prefer the Node built-in test runner; use Ajv only as a dev dependency for schema
tests, with hand-written runtime validators to keep the attack surface small.

Loopback control API: bind `127.0.0.1` only, ephemeral port, per-run random token written to a
user-only file (0600). No state-changing endpoint without the token. No external listener.

### 4.4 Simulator

A CLI process that speaks the protocol over the socket transport:

- completes `hello`/`ready`, sends `config` and snapshots;
- emits heartbeats and simulates link loss, resets and sequence gaps;
- injects synthetic gestures (`interaction`) for bridge tests;
- optionally prints a compact ASCII state for CI logs.

The simulator must be labelled as a simulator in every log line and on the device screen when the
bridge reports it as the source.

### 4.5 Tests

| Level | Cases |
| --- | --- |
| Protocol unit | Round-trip every message; bounds; null semantics; unknown fields/types |
| Boundary | Lines of 2047, 2048, 2049 bytes; truncated UTF-8 |
| Hostile input | Malformed JSON, wrong types, huge numbers, deeply nested objects |
| Sequence | Duplicate, stale, gap, wrap; resync then snapshot |
| Version | Common major, no common major, unknown minor fields |
| Reconnect | Device reset, bridge restart, cable re-plug, port change |
| Reducer | Priority table, concurrency, terminal TTL, tool failure vs execution failure |
| Metrics | Dedup by session/message/tool, cumulative token clamp, out-of-order |
| Privacy | Generated events with prompts/code/paths; assert nothing forbidden on the wire |
| Soak | At least 1 hour with periodic simulated resets; heap and RSS bounded |

Hardware smoke: flash the parser build, connect the bridge, verify handshake, snapshot, heartbeat and
reconnect on the real device.

## 5. Task breakdown

| ID | Task | Depends on |
| --- | --- | --- |
| P2-01 | Ratify protocol v1 and freeze schema/examples | — |
| P2-02 | Firmware `ProtocolParser` + envelope validation | P2-01 |
| P2-03 | Firmware message handlers + state application | P2-02 |
| P2-04 | Firmware heartbeat, ack, resync, link loss | P2-03 |
| P2-05 | Bridge scaffold (TS strict, config, logging) | P2-01 |
| P2-06 | `ProtocolCodec` + `SerialTransport` + discovery | P2-05 |
| P2-07 | `EventNormalizer`, `SessionRegistry`, `StateReducer`, `MetricsManager` | P2-06 |
| P2-08 | `PrivacyFilter` and allowlist tests | P2-07 |
| P2-09 | `MockAdapter` and `SocketTransport` | P2-05 |
| P2-10 | Simulator CLI and scenarios | P2-09 |
| P2-11 | Diagnostics mode and sanitized trace | P2-06 |
| P2-12 | Protocol boundary and hostile-input tests | P2-02, P2-06 |
| P2-13 | Reconnect/reset integration tests | P2-10 |
| P2-14 | Hardware smoke and 1-hour soak | P2-13 |
| P2-15 | Phase 2 report, evidence, handover | all |

## 6. Acceptance criteria

- Handshake succeeds on the real device and with the simulator.
- A complete snapshot is sent after every reconnection and device reset.
- Sequence gaps trigger `resync` and end with a fresh snapshot.
- Oversized, malformed and unsupported messages are rejected without reboot or crash.
- Unknown fields never leak; the privacy capture test passes.
- The bridge survives unplug/replug and port renumbering without restart.
- OpenCode is not required for any Phase 2 test.
- A 1-hour soak shows bounded heap/RSS and zero unexpected resets.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Opening the CDC port resets the board | Document; design reconnect as normal, not exceptional. |
| Serial port is single-owner | Detect ownership; fail with an actionable message; never kill another process. |
| JSON parsing pressure on a small MCU | Bounded document, reject before large allocation, measure high-water mark. |
| `serialport` native prebuilds missing in enterprise images | Evaluate alternatives early; keep the transport interface abstract. |
| Protocol drift between firmware and bridge | One schema, shared test vectors, CI validation of examples. |
| Proxy blocks registry downloads | Use the system trust store; local cache fallback for development; never disable TLS. |
| Token/tool double counting | Dedup keys and cumulative clamps, tested with out-of-order fixtures. |

## 8. Deliverables

- Ratified protocol, schema, examples and test vectors.
- Firmware parser and protocol handlers, with a measured memory report.
- TypeScript bridge with the component set, mock adapter and diagnostics.
- Simulator CLI.
- Test suite and a 1-hour soak report.
- `docs/phase-2-report.md` and sanitized evidence.

## 9. Gate

Phase 2 starts only on explicit Product Owner approval. At the end, the report is presented for
review before Phase 3. No OpenCode integration work is allowed before that gate.
