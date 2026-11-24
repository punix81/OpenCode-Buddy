# Phase 2 test evidence

Date: 2026-11-24. Every command below was executed in this session; the results are copied from the
actual output. No hardware was used.

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript typecheck | `cd bridge && npm run typecheck` | **PASS** (0 diagnostics) |
| TypeScript tests | `cd bridge && npm test` | **33/33 PASS**, 0 fail, 0 skipped |
| Protocol schema + vectors | `cd bridge && npm run validate:protocol` | **PASS** — 11 valid, 13 invalid, 11 examples |
| Firmware parser host tests | `firmware/test/host/run.sh` | **PASS**, 0 warnings from Buddy sources |
| Simulator end-to-end | `cd bridge && npm run simulate -- --scenario full-session --duration 9000` | **PASS** — handshake, snapshots, 16 device-received states |
| Firmware clean build | `pio run` (clean) | **SUCCESS**, 19.14 s |

Environment: Node.js v24.22.1, TypeScript 5.8.3, Ajv 8.20.0, g++ host compiler with the cached
ArduinoJson 7.4.3 headers.

## TypeScript tests (`bridge/test/*.test.ts`)

33 tests, grouped by concern:

### `protocol.test.ts`

- every valid vector passes `validateMessage`
- every invalid vector fails with the documented error code (`E_PARSE`, `E_BOUNDS`, `E_TOO_LONG`,
  `E_VERSION`, `E_UNKNOWN_TYPE`)
- the sequence tracker reproduces the normative cases: first message, in order, duplicate, stale,
  gap, new session
- the framer handles split, concatenated and CRLF input
- the 2047/2048-byte line boundary behaves as specified
- an oversized line is discarded and the framer recovers on the next valid line
- version negotiation requires a common major
- `heartbeat` with a `data` object is rejected

### `reducer.test.ts`

- a pending permission outranks tool execution across sessions
- a tool failure does not raise the execution `error` state; `execution.failed` does
- terminal `success` expires after its TTL
- `interrupted` expires after its TTL
- token usage keeps the cumulative maximum
- tool calls are deduplicated by tool id and message id
- unavailable tokens are explicit `null`, never `0`
- OpenCode and MCP values are carried through
- a degraded bridge reports `offline`

### `metrics.test.ts`

- tool counters are deduplicated and `running` is balanced
- usage keeps the maximum per session and sums sessions
- no usage means unavailable, not zero

### `privacy.test.ts`

- unknown upstream fields (`prompt`, `response`, `toolArguments`) never reach the projection
- URLs are redacted and control characters are neutralised in display strings
- out-of-range numbers are clamped
- an invalid diagnostic code is dropped
- a missing bridge version renders as `--`

### `logger.test.ts`

- counters such as `tools=0/0/0` and `tokens=1200/900` are not mistaken for paths
- absolute paths, URLs and e-mail addresses are redacted
- control characters are removed

### `bridge.test.ts`

- handshake completes and a snapshot reaches the device simulator
- the `mock` source is carried to the device
- interactions are forwarded to the host callback and never act on the device
- a silent device degrades the bridge and the next snapshot reports `offline`
- an incompatible protocol major is rejected

## Firmware host tests (`firmware/test/host/`)

The parser has no Arduino dependency, so it is compiled with the host `g++` and consumes the same
`protocol/test-vectors/messages.json` as the TypeScript suite.

Covered:

- all valid vectors accepted (device-inbound types)
- all invalid vectors rejected with the expected code
- device-outbound types (`hello`, `interaction`, `resync`) refused as `E_UNKNOWN_TYPE`
- sequence: ready/config/state accepted, ACK value 3, duplicate, stale, gap → resync (expected 4,
  received 6), then the next snapshot applied
- invalid input (`status: "nope"`) leaves the previous `Working` state untouched
- token total computed when absent; `mock` source propagated
- config accepted, values clamped (`debounceMs` 5 → 10) and reported with `E_BOUNDS`
- 2047-byte line accepted, 2048-byte line rejected

## Protocol validation (`bridge/scripts/validate-protocol.ts`)

- schema compiles under Ajv 2020-12
- 11 valid vectors validate against the schema
- 13 invalid vectors are rejected by the runtime validator with the documented code
- 11 example files validate against the schema

Two real defects were found by this validation and fixed:

1. the firmware returned `E_BOUNDS` for a missing required field; missing fields must be `E_PARSE`;
2. the same ambiguity existed in the TypeScript validator for `status`, `source`,
   `activeSessions`, `connection` and `versions`.

## Simulator smoke test

`npm run simulate -- --scenario full-session --duration 9000` runs the bridge against the device-side
simulator over an in-memory transport. Verified: handshake (`hello` → `ready` → `config` →
`state` → `mcp_status`), periodic snapshots, and the state progression
`idle → thinking → working → generating → success → idle`, with `source=mock` on every state.

## Not covered

- USB CDC on real hardware (no serial port opened in this phase)
- Windows or macOS
- 1-hour soak
- display and touch regressions after the parser was added
- heap high-water mark on the device (requires the diagnostic build)
