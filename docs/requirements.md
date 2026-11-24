# Requirements — OpenCode Buddy

Identifier scheme: `FR-*` functional, `NFR-*` non-functional, `CON-*` constraint.
Priority: **M** must, **S** should, **C** could (MoSCoW). "Verified in" names the phase that proves it.

## 1. Purpose

Provide a desk-side device that displays the live activity of OpenCode v2 so that a developer does not
have to watch the terminal, without exposing any conversation content.

## 2. Functional requirements

### 2.1 Observation

| ID | Pri | Requirement | Verified in |
| --- | --- | --- | --- |
| FR-001 | M | Observe sessions of the locally running OpenCode v2 server, including CLI, TUI and Desktop clients that share that server. | 3 |
| FR-002 | M | Detect execution start, success, failure and interruption. | 3 |
| FR-003 | M | Detect reasoning and response-generation phases when the server reports them. | 3 |
| FR-004 | M | Detect tool call start, success and failure, and count them per category (read, edit, shell, search, mcp, other). | 3 |
| FR-005 | M | Detect pending permission requests and pending user-input requests (forms) in any session. | 3 |
| FR-006 | M | Detect retry scheduling and context compaction. | 3 |
| FR-007 | M | Report the active model and agent per session and for the aggregate view. | 3 |
| FR-008 | M | Report token usage when the server provides it, aggregated across active sessions. | 3 |
| FR-009 | M | Report MCP server connection status (connected, pending, disabled, failed, needs-auth). | 3 |
| FR-010 | M | Support multiple concurrent sessions and aggregate their state deterministically. | 3 |
| FR-011 | S | Report context-window usage only when a reliable limit and a reliable used-token count are both available; otherwise show "unavailable". | 4 |
| FR-012 | C | Report quota or rate-limit information only if an official API exposes it; otherwise show "not supported". | 4 |

### 2.2 Communication and resilience

| ID | Pri | Requirement | Verified in |
| --- | --- | --- | --- |
| FR-020 | M | Connect to the device over USB CDC using versioned NDJSON. | 2 |
| FR-021 | M | Perform a handshake with version negotiation; report incompatible versions explicitly. | 2 |
| FR-022 | M | Send a complete state snapshot after every reconnection or device restart. | 2 |
| FR-023 | M | Exchange heartbeats every 2 s and declare the link down after 6 s of silence. | 2 |
| FR-024 | M | Reconnect automatically and survive device resets without restarting the bridge. | 2 |
| FR-025 | M | Keep OpenCode fully functional when the bridge, the USB device or the plugin is unavailable. | 2, 3 |
| FR-026 | M | Deduplicate events and prevent double counting of tokens and tool calls. | 2, 3 |
| FR-027 | M | Tolerate out-of-order and duplicate events; recover with a snapshot resync. | 2 |
| FR-028 | M | Distinguish a recoverable tool failure from a failed execution. | 2, 3 |
| FR-029 | M | Provide a mock event source that works without OpenCode or hardware, clearly labelled as mock. | 2 |
| FR-030 | S | Provide diagnostic mode with sanitized logs and protocol tracing without payload content. | 2 |

### 2.3 Device interaction

| ID | Pri | Requirement | Verified in |
| --- | --- | --- | --- |
| FR-040 | M | Display the companion state and the six dashboard screens on a 240 × 240 circular display. | 1, 4 |
| FR-041 | M | Short press advances to the next screen; double press returns to the Buddy screen. | 1 |
| FR-042 | M | Long press (~1.5 s) toggles quiet mode; very long press (~5 s) resets display preferences with visual feedback. | 1 |
| FR-043 | M | A very long press must not additionally fire the long-press action; double actions are prevented. | 1 |
| FR-044 | M | Return to the Buddy screen after 60 s of inactivity. | 1 |
| FR-045 | M | Gesture timings are configurable from the bridge. | 2, 4 |
| FR-046 | M | Quiet mode suppresses automatic screen switching and intrusive animation while keeping alerts visible. | 1, 4 |
| FR-047 | M | The touch sensor can never approve a permission, run a command or modify source code. | 1–4 |
| FR-048 | M | Support English, French and German interface text. | 4 |
| FR-049 | S | Persist display preferences (screen, language, quiet mode) across device restarts. | 1 |

### 2.4 Distribution

| ID | Pri | Requirement | Verified in |
| --- | --- | --- | --- |
| FR-060 | M | Provide Windows and Linux installation paths for the bridge and plugin. | 6 |
| FR-061 | M | Provide flashing instructions that preserve a documented restore path. | 6 |
| FR-062 | S | Provide macOS compatibility where practical. | 6 |

## 3. Non-functional requirements

| ID | Pri | Requirement |
| --- | --- | --- |
| NFR-001 | M | Firmware loop is non-blocking; no `delay()` in animation, serial or touch paths. |
| NFR-002 | M | Animations render at 20–30 FPS on the target hardware where measurements permit, using partial refresh, without visible flicker. |
| NFR-003 | M | Steady-state memory use is bounded: no per-frame allocation, fixed-size buffers for protocol lines and text. |
| NFR-004 | M | Bridge and plugin add negligible latency to OpenCode; event handling never blocks the agent loop and is bounded in work per event. |
| NFR-005 | M | Protocol lines are limited to 2048 bytes; malformed, oversized and unsupported messages are rejected safely without rebooting. |
| NFR-006 | M | State reduction is deterministic and unit-tested: same event sequence yields the same display state. |
| NFR-007 | M | Privacy filtering is default-deny: unknown fields never leave the process. |
| NFR-008 | M | No telemetry, no analytics, no cloud service, no listening interface beyond loopback. |
| NFR-009 | M | Bridge runtime memory and CPU remain modest (target: < 100 MB RSS, < 2 % CPU idle). |
| NFR-010 | S | Eight-hour continuous run on real hardware without leak, crash or display corruption. |
| NFR-011 | M | All transmitted strings are length-limited and sanitized (no control characters, no unbounded text). |

## 4. Constraints

| ID | Constraint |
| --- | --- |
| CON-001 | Existing hardware only: ESP32-C3 Super Mini, GC9A01 240 × 240, TTP223, USB-C cable. No extra components. |
| CON-002 | Wiring and display configuration identical to the proven reference build. |
| CON-003 | Wi-Fi and Bluetooth disabled on the device. |
| CON-004 | OpenCode v2 official APIs only; v1 assumptions are invalid. |
| CON-005 | No modification of the reference project, of existing OpenCode configuration, or of enterprise security controls without approval. |
| CON-006 | Public repository: no employer, customer, credential or infrastructure data may enter history. |
| CON-007 | No flashing without explicit user approval. |

## 5. Out of scope

- Approving permissions or answering questions from the device.
- Sending prompts from the device.
- Displaying conversation text, code or diffs.
- Multi-device or networked fleet management.
- Employee monitoring or usage reporting to third parties.
- Wireless connectivity on the device.

## 6. Definition of prototype acceptance

The first functional prototype is accepted when, with reproducible evidence: the firmware builds; the
display and touch work with the reference wiring; the bridge detects the device; the handshake
succeeds; mock events drive the companion; a real OpenCode execution changes the state; a permission
request is shown; success and failure are distinguishable; the touch pad navigates screens; USB
disconnect/reconnect does not crash the bridge; OpenCode keeps working without the device; no
sensitive data is transmitted.
