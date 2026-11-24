# Bridge — TypeScript/Node

Phase 2 status: **implemented and tested without hardware; hardware validation pending approval.**
It is a local, provider-independent process that speaks the ratified NDJSON protocol over USB CDC.

## Requirements

- Node.js **22 or newer** (developed on Node 24.22.1).
- PlatformIO is not needed to run the bridge.
- Dependencies are pinned and a lockfile is committed:

| Package | Version | Role |
| --- | --- | --- |
| `serialport` | 13.0.0 | USB CDC runtime (native binding, Node >= 20) |
| `typescript` | 5.8.3 | dev: type checking and build |
| `tsx` | 4.23.15 | dev: run TypeScript directly |
| `ajv` | 8.20.0 | dev: validate JSON Schema in CI/tests |
| `@types/node` | 24.4.0 | dev: Node typings |

No provider SDK (DeepSeek, Ollama, OpenAI) is a dependency. Phase 3 will feed normalized events into
the bridge; Phase 2 runs from the mock adapter or the simulator.

## Install and check

```sh
cd bridge
npm install
npm run typecheck
npm test
npm run validate:protocol
```

`npm install` may warn about install scripts not covered by the local allow-list. The tested packages
load without running them; do not approve scripts blindly.

## Commands

Run from `bridge/`:

```sh
# Hardware: drive the device with scripted mock events (source is labelled MOCK)
npm run mock -- --scenario full-session --port /dev/ttyACM0
npm run mock -- --scenario permission --port /dev/ttyACM0
npm run mock -- --scenario multi-session
npm run mock -- --scenario all-states

# Hardware: diagnose the real link (handshake, state, heartbeats)
npm run diagnose -- --port /dev/ttyACM0
npm run diagnose -- --port /dev/ttyACM0 --duration 60000

# No hardware: device simulator + bridge over an in-memory transport
npm run simulate -- --scenario full-session --duration 20000
```

Without `--port`, the bridge enumerates Espressif USB devices (VID `303a`, PID `1001`) and refuses
to write to anything it did not identify. A port can be selected manually at any time.

## Configuration

Copy `config.example.json` to `config.local.json` (git-ignored) and adjust:

| Field | Default | Notes |
| --- | --- | --- |
| `port` | `null` | Manual path; `null` enables discovery |
| `autoDetect` | `true` | Only Espressif `303a:1001` candidates |
| `baudRate` | `115200` | Native USB CDC ignores the rate |
| `heartbeatMs` | `2000` | Protocol heartbeat period |
| `linkTimeoutMs` | `6000` | Degraded/offline threshold |
| `stateIntervalMs` | `1000` | Snapshot refresh period |
| `reconnectDelaysMs` | `[1000,2000,4000,8000,15000]` | Backoff sequence |
| `logLevel` | `info` | `error`, `warn`, `info`, `debug` |
| `allowRealMcpNames` | `false` | Aliases by default |
| `source` | `live` | Mock mode uses `mock` |

## Components

| Module | Responsibility |
| --- | --- |
| `transport/` | `Transport` interface, `SerialTransport`, `SocketTransport`, in-memory pair |
| `device/discovery` | Espressif USB enumeration, manual override, never opens blindly |
| `protocol/validator` | Default-deny validation of every message and field |
| `protocol/codec` | NDJSON framing, encoding, sequence tracking, version negotiation |
| `state/registry` | Per-session state and event application |
| `state/reducer` | Deterministic aggregate state, priority and TTLs |
| `metrics/` | Token cumulative maxima, tool deduplication and categories |
| `privacy/` | Final allowlist projection before serialization |
| `normalize/` | Default-deny normalization of mock/simulated events |
| `adapters/mock` | Scripted scenarios, explicitly labelled as mock |
| `simulator/` | Device-side protocol emulator |
| `bridge` | Handshake, heartbeat, snapshots, reconnect, status machine |
| `cli/` | `mock`, `diagnose`, `simulate` entry points |

## Link behaviour (Phase 1 findings applied)

- Opening `/dev/ttyACM0` resets the ESP32-C3. The bridge opens **one persistent connection** and
  never opens the port per message.
- It waits for a valid `hello` before sending `ready`, `config`, `state` or `mcp_status`.
- DTR/RTS are explicitly set low after open and never toggled per message.
- Reconnect uses exponential backoff 1, 2, 4, 8, 15 s and a full snapshot after handshake.
- A missing device, a busy port, a permission error, an incompatible protocol and a heartbeat
  timeout are distinct states in the logs.

## Security

- Only allowlisted fields leave the process; prompts, responses, code, tool arguments, shell
  commands, paths and credentials are never part of the normalized event or the protocol.
- Logs are sanitized: URLs, e-mail addresses, absolute paths and long token-like strings are
  redacted; payloads are never logged.
- Sockets are loopback-only; the serial path is local.
- No telemetry, no cloud service, no provider SDK, no remote command execution.
