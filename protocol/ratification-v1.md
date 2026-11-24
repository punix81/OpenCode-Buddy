# Protocol v1 ratification review

Status: **APPLIED — protocol v1 is ratified.** The ten defects below were applied to
`protocol-v1.md`, the JSON Schema, the examples and the test vectors. `npm run validate:protocol`
passes (11 valid vectors, 13 invalid vectors, 11 examples) and the firmware host tests pass with the
same vectors. No firmware or bridge code consumes the draft any more.

Inputs: `protocol/protocol-v1.md` (Phase 0 draft), `protocol/schemas/protocol-v1.schema.json`,
`docs/phase-2-plan.md`, and the Phase 1 implementation experience.

## 1. Decisions to freeze

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| R-01 | Framing | UTF-8 NDJSON, `\n`, `\r` ignored, 2048 B including newline, discard to next newline on overflow | Survives corruption; matches the proven reference approach |
| R-02 | Serial parameters | 115 200 nominal, 8N1, no flow control | Native USB CDC ignores the rate; hosts expect a value |
| R-03 | Envelope | `v`, `type`, `seq`, optional `ts`, `data` (except heartbeat), optional `id` | Minimal and inspectable |
| R-04 | Sequence | Per sender and per connection, +1 from 1 after `hello`; duplicate ignored; gap → `resync` then snapshot | Deterministic recovery without a second ordering scheme |
| R-05 | Version | Integer major set; highest common major; no common → fatal `E_VERSION` | Explicit incompatibility instead of guessing |
| R-06 | Snapshot | `state` is a complete, idempotent snapshot; never a delta | A missed message is never fatal |
| R-07 | Unavailable values | `null`, never `0`; unknown enum → `offline` + diagnostic code | Prevents invented metrics |
| R-08 | Heartbeat | Every 2 s both directions; link down after 6 s | Matches the Phase 1 link model |
| R-09 | Unknown fields | Ignored at envelope level; rejected inside `data` (closed object) | Forward compatibility without silent data corruption |
| R-10 | Unknown types | `E_UNKNOWN_TYPE`, connection stays open | Robustness |
| R-11 | Interaction | Gestures only (`short`, `double`, `long`, `very_long`) plus the visible screen index | The device can never approve, execute or edit |
| R-12 | Error codes | `E_PARSE`, `E_TOO_LONG`, `E_UNKNOWN_TYPE`, `E_VERSION`, `E_BOUNDS`, `E_SERIAL`, `E_INTERNAL` | Closed set, testable |
| R-13 | Size limits | Strings bounded per field; alias ≤ 12; detail ≤ 48; model ≤ 40; agent ≤ 24 | Keeps the line under 2048 B and the UI safe |

## 2. Defects found in the draft

These are real inconsistencies between the draft prose and the device's actual knowledge. They must be
fixed before the schema is frozen.

| # | Defect | Resolution |
| --- | --- | --- |
| D-01 | `state.connection.usb` is sent by the bridge, but only the device can observe its own USB link | Remove `connection.usb` from the wire. The device derives USB locally; the bridge sends only `bridge` and `opencode`. |
| D-02 | `state.versions.fw` is sent by the bridge, but the firmware knows its own version | The device uses its compiled version; the bridge sends `versions.bridge` and `versions.protocol` only. Keep `fw` optional and ignore it if received. |
| D-03 | `ready.session` is undocumented and could be confused with an OpenCode session ID | Define it as a **bridge run identifier** (random, non-reversible, ≤ 8 hex chars), never an OpenCode ID. |
| D-04 | `ack` carries both an envelope `seq` and `data.ack` without saying which is acknowledged | `data.ack` = the last successfully applied peer `seq`; the envelope `seq` is the sender's own counter. State this explicitly. |
| D-05 | `hello.seq` is shown as 1, while the rule says numbering starts at 1 after `hello` | `hello` is the first message and carries `seq = 1`; subsequent messages continue from 2. Clarify. |
| D-06 | `state.notifications` has no definition | Define it as the number of **unacknowledged user-visible alerts** on the device context, bounded 0–99. |
| D-07 | `tokens.total` does not say whether reasoning tokens are included | Define `total = input + output`; reasoning and cache remain separate and optional. Provider totals may differ; never fabricate. |
| D-08 | `interaction.screen` has no behaviour for an unknown index | Clamp to 0–5; an out-of-range value is `E_BOUNDS` and the screen is not changed. |
| D-09 | `resync` replies are described but not ordered | Reply order is fixed: `config`, `state`, `mcp_status`, each with a fresh `seq`. |
| D-10 | `heartbeat` is the only message without `data`; the schema must say so explicitly | Keep `data` optional **only** for `heartbeat`; every other type requires it. |

## 3. Required edits before freeze

1. `protocol/protocol-v1.md`: apply D-01…D-10; add a “field ownership” column stating whether the
   bridge, the device or both own each field.
2. `protocol/schemas/protocol-v1.schema.json`: remove `connection.usb`; make `versions.fw` optional
   and ignored; require `data` for all types except `heartbeat`; keep `additionalProperties: false`
   inside `data`.
3. `protocol/examples/state.json`: drop `connection.usb` and `versions.fw`, keep `versions.bridge` and
   `versions.protocol`.
4. Add test vectors:
   - valid `hello`/`ready` with negotiation;
   - `state` with `null` tokens and `CTX --` semantics;
   - 2047, 2048 and 2049-byte lines;
   - unknown top-level field (accepted) vs unknown field in `data` (rejected);
   - duplicate, stale and gapped `seq`;
   - version mismatch;
   - `interaction` with an invalid screen index;
   - `error` with each code.
5. Update `docs/security.md` if field ownership changes the allowlist (it should not: removing
   `connection.usb` and `versions.fw` reduces what leaves the bridge).

## 4. Open questions for the Product Owner

None block P2-02. The following can be decided during implementation without changing the wire:

- Whether `notifications` counts only alerts raised while the device was connected, or all unseen
  alerts since the bridge started. Proposal: alerts raised while connected, capped at 99.
- Whether `mcp_status` aliases should be stable across bridge restarts. Proposal: stable within a
  run; aliases may change after a restart, and the UI must not assume more.

## 5. Next actions

1. Apply the edits in §3 and mark `protocol-v1.md` as **RATIFIED v1**.
2. Add the test vectors and validate the schema against the examples.
3. Only then start P2-02 (firmware `ProtocolParser`).

Until §3 is complete, neither firmware nor bridge code should consume the draft.

## 6. Amendments found during hardware validation (2026-11-24)

These points were discovered only when the Phase 2 image ran on the real board. They are normative and
are applied to `protocol-v1.md`, the firmware and the bridge.

| ID | Finding | Decision |
| --- | --- | --- |
| D-11 | Opening the USB port does not reliably reset the ESP32-C3, so a bridge started after boot never received `hello` and stayed in `handshaking` forever | The device re-announces `hello` every 3 s while no bridge session is established, and `resetSession()` restarts its sequence |
| D-12 | `hello` frames written while no host was reading were buffered in the CDC driver and replayed as a burst at open, overflowing peer buffers | Addressed by D-13 and D-15. Gating the announcement on `bool(Serial)` was implemented and then reverted (D-17) |
| D-13 | The burst of four full snapshots produced one truncated line in each direction (`E_PARSE`) before a resync recovered | The bridge ignores a repeated `hello` with the same `boot` within 2 s of the handshake |
| D-14 | Setting `dtr`/`rts` on this native USB CDC port fails with "Operation not supported" and emits a port error that the bridge read as fatal | The bridge never touches modem control lines; a port error is a link loss that triggers backoff, not a permanent error |
| D-15 | Writing NDJSON to a CDC port that no host reads filled the TX buffer, blocked the main loop and the watchdog rebooted the board (observed once in an 11-minute soak) | A peer must never block on a full transport buffer: the firmware checks `Serial.availableForWrite()` and drops (and counts) the frame. Every message is retried or superseded |
| D-16 | `--after hard-reset` toggles RTS, which is not wired to EN here, so the chip can remain in the ROM bootloader after a flash and never run the application | Operational only, not on the wire: a watchdog reset (`--after watchdog-reset`) is required to start the flashed application |
| D-17 | Gating the announcement on `bool(Serial)` (the D-12 mitigation) left the device permanently mute after an esptool reset: the host had already asserted DTR, so the firmware believed a reader was attached and dropped every frame | Reverted. The device announces on a fixed 3 s period whenever no bridge session exists, and never blocks or depends on host-attachment state |
| D-18 | The core's 256-byte USB CDC RX queue overflowed while a full-screen render blocked the loop, losing bytes mid-frame; a second board showed `E_PARSE` + two resyncs at every handshake | The firmware calls `Serial.setRxBufferSize(1024)` first in `setup()`, the value the reference firmware uses. 4096 was tried and left one unit unable to receive at all; 1024 is the validated value |
| D-19 | Even with a 1024-byte queue, the handshake burst (ready + config + full state + mcp_status + ack ≈ 1.1 KB) overran it and one frame was lost per connection | The bridge sends `ready`, `config` and the `ack` immediately and defers `state` + `mcp_status` to the next tick (~100 ms). The result is two groups well under the queue size; measured on hardware as 0 errors over a 20 s run |

The resync path proved itself: the single truncated message in each direction was detected, reported
and recovered with a full snapshot, without a visible inconsistency and without a restart.
