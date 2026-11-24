# Security and privacy design — OpenCode Buddy

This project is intended for developer workstations, including restricted enterprise environments.
It is public: the design assumes that everything in this repository and on the USB wire can be read
by a third party.

## 1. Threats considered

| # | Threat | Mitigation |
| --- | --- | --- |
| T1 | Conversation content leaks to the device or its logs | Default-deny allowlist, two filters, no raw payload forwarding, sanitized logs, tests asserting absence of forbidden fields. |
| T2 | Credentials or tokens leak through configuration or logs | No secret in repository; configuration never logged; environment values never printed; redaction of key-like patterns. |
| T3 | The device becomes a remote-control surface | Device sends only gestures and protocol control; no approval, execution or file operation exists in the protocol. |
| T4 | The bridge is reachable from the network | Bind loopback only (127.0.0.1); no 0.0.0.0; no UPnP; no port forwarding; state-changing endpoints require a per-run token. |
| T5 | Malicious or buggy device input corrupts the bridge | Strict schema validation, size caps, enum clamping, number bounds, drop-on-error. |
| T6 | Malicious host input corrupts the firmware | Bounded line buffer, size cap, JSON parse failure isolation, unknown-type rejection, no unbounded allocation. |
| T7 | Dependency supply chain | Minimal dependencies, pinned versions, licence and advisory review, no install scripts from untrusted packages. |
| T8 | Denial of service against OpenCode | Bounded queue, drop-oldest, non-blocking sends, timeouts, failure isolation; OpenCode never waits on the Buddy. |
| T9 | Employee monitoring | Local metrics persistence off by default; no export, no telemetry, no aggregation service. |
| T10 | Unauthorised flashing or firmware swap | Explicit approval gate; documented restore procedure; no OTA in scope. |

Out of scope: physical attacks on the USB cable, compromised host OS, malicious OpenCode plugins
installed by the user.

## 2. Data classification

| Class | Examples | Leaves OpenCode? | Leaves host? |
| --- | --- | --- | --- |
| Prohibited | prompts, responses, reasoning text, code, diffs, file contents, shell commands, tool arguments, absolute paths, project names, secrets | No | No |
| Sensitive | MCP server real names, account/provider identifiers | Only if explicitly enabled | No |
| Operational | model name, agent name, state, timings, token counts, tool counts by category, MCP status class, versions | Yes | Yes (USB only) |
| Diagnostic | error class codes, counters, uptime | Yes, sanitized | Yes (USB only) |

## 3. Field allowlist (protocol level)

This is the complete set of values the device may ever receive.

```text
status              enum: offline|idle|thinking|generating|working|permission_required|
                          user_input_required|success|error|compacting|retrying|interrupted
model               string, <= 40 chars, sanitized
agent               string, <= 24 chars, sanitized
activeSessions      uint16
elapsedSeconds      uint32
pendingPermissions  uint8
pendingQuestions    uint8
notifications       uint8
tokens.input        uint64 | null
tokens.output       uint64 | null
tokens.total        uint64 | null
tokens.contextPct   float 0..100 | null
tools.success       uint32
tools.failed        uint32
tools.running       uint8
tools.categories    map<read|edit|shell|search|mcp|other, uint32>
mcp.online          uint8
mcp.total           uint8
mcp.servers[]       { alias <= 12 chars, status enum, }        (no URL, no command, no error text)
connection.usb      enum: connected|disconnected
connection.bridge   enum: ready|degraded
connection.opencode enum: connected|offline
versions.fw         semver-ish, <= 16 chars
versions.bridge     semver-ish, <= 16 chars
versions.protocol   protocol major as a bounded integer
diagnostic.code     enum of known codes
language            enum: en|fr|de
quietMode           bool
gestures            bounded integers (ms)
```

`versions` and `diagnostic.code` travel as optional members of the `state` snapshot; they are sourced
from the handshake (`hello`/`ready`) and from the last sanitized local error class. They never carry a
build path, a hostname or a free-form message.

Everything else is dropped. The allowlist is implemented as an explicit projection, not as a
blacklist filter: a new OpenCode field never appears on the wire without a code change and a review.

Sanitization rules for every string: trim, remove control characters, collapse whitespace, truncate
to the field limit, reject invalid UTF-8. Model/agent names are additionally matched against a
redaction pattern (URLs, e-mail addresses, key-like tokens) and replaced with `unknown` if matched.

## 4. Filtering points

1. **Plugin `PrivacyGate`** — converts OpenCode events into the normalized event union. Raw event
   objects are never forwarded; only enumerated fields survive. Tool `input`, tool `content`,
   `text`, `reasoning`, `native`, `metadata`, `resources`, `message` and error bodies are explicitly
   dropped (they are the highest-risk fields in the v2 event surface).
2. **Bridge `EventNormalizer` / `PrivacyFilter`** — validates the normalized event with the same
   schema, re-applies limits, and projects it onto the protocol allowlist before serialization.
3. **Firmware `ProtocolParser`** — accepts only known keys with correct types and bounds; renders
   only enumerated states and bounded numbers.

Two independent filters mean a plugin regression cannot silently leak content to the device.

## 5. Transport security

- Plugin ↔ bridge: loopback only. The bridge binds `127.0.0.1`; the quickest correct default for
  local IPC. State-changing requests carry a random per-run token written to a user-only file
  (permissions 0600) in the runtime directory.
- Bridge ↔ device: USB CDC, physically local. No authentication is possible or claimed; the threat
  model assumes physical access equals trust. The protocol therefore stays read-mostly and
  cannot cause host-side actions beyond screen and preference changes.
- No TLS is used on USB; no network listener is opened.

## 6. Logging

- Structured, line-based, to stderr or a rotating file (size cap, retention cap).
- Never log raw events, configuration values, environment variables or protocol payloads.
- Diagnostic mode may log message type, byte length, sequence number and error class — never content.
- Redaction pass before write: key-like patterns, URLs, absolute paths, e-mail addresses.
- Log level default `info`; `debug` requires explicit opt-in and prints a warning banner.

## 7. Persistence

- Local metrics persistence: **off by default**. When enabled, only aggregate counters are stored,
  never per-session titles or identifiers.
- Device preferences in NVS: language, quiet mode, last screen. No session data.
- No database, no cloud sync, no export.

## 8. Supply chain and dependencies

Planned runtime dependencies and their purpose:

| Package | Purpose | Notes |
| --- | --- | --- |
| `serialport` | USB CDC access on Windows/Linux/macOS | Native module; evaluate alternatives and prebuilds before adoption. |
| `ajv` (or a small validator) | Protocol/schema validation | Needed for safe input handling; may be replaced by hand-written validators if smaller. |
| `@opencode/plugin`, `@opencode/client` | Official plugin API types | Peer/runtime provided by OpenCode; pin to the supported CLI minor. |
| Firmware: `LovyanGFX`, `ArduinoJson` | Display driver, JSON parsing | Already proven on the reference hardware; MIT licences. |

Rules: pin exact versions, no postinstall scripts from untrusted sources, record licences in the
SBOM step of Phase 5, run an advisory scan before each release, and re-evaluate `serialport`
alternatives if native builds are unavailable in enterprise images.

## 9. Enterprise constraints

- The bridge must work behind a corporate proxy without modifying proxy or TLS settings; local IPC and
  USB need no outbound network.
- No telemetry or update check is performed at runtime.
- Installation scripts never modify global OpenCode configuration silently; they print the exact
  change and require confirmation.
- The device never displays internal hostnames, URLs or account identifiers.

## 10. Residual risks

| Risk | Residual level | Note |
| --- | --- | --- |
| Model/agent names may be sensitive in some organisations | Low | Truncated, sanitized; can be disabled by configuration. |
| MCP real names can reveal internal tooling | Low | Alias mode is the default. |
| Physical USB access allows a hostile device to send arbitrary lines | Low | Protocol is read-mostly; bridge validates strictly; no host actions. |
| A compromised host can read what the device displays | Accepted | Same trust boundary as the terminal. |

## 11. Security acceptance checks (Phase 5)

1. Capture 10 000 generated events containing prompts, code, paths and token-like strings; assert the
   serialized protocol stream contains none of them.
2. Fuzz the firmware parser with oversized, truncated, binary and deeply nested lines; assert no
   reboot, no watchdog trip, no allocation failure.
3. Fuzz the bridge with malformed plugin messages; assert bounded memory and no unhandled rejection.
4. Verify the listener is bound to loopback only (`ss -lntp`) and rejects unauthenticated state changes.
5. Verify logs contain no secret-like pattern across a full session.
6. Verify OpenCode latency is unchanged with the plugin loaded and the bridge absent.
