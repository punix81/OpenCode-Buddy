# Phase 2 — USB protocol, bridge and simulator

## Objective

Make the host↔device link trustworthy: ratified protocol v1, resilient firmware serial layer, a modular TypeScript bridge, and a simulator that exercises the real codec.

## Technical scope

- Ratify `protocol/protocol-v1.md` and its schema; freeze v1.
- Firmware: `SerialManager` + `ProtocolParser` with hostile-input handling and resync.
- Bridge: `ConfigurationManager`, `SerialTransport`, `DeviceDiscovery`, `EventNormalizer`, `SessionRegistry`, `StateReducer`, `MetricsManager`, `PrivacyFilter`, `MockAdapter`, `DiagnosticLogger`.
- Loopback-only plugin endpoint with a per-run token.
- Simulator with scenario player and boundary harness.

## Implementation checklist

- [ ] Freeze protocol v1 after review; tag the spec version.
- [ ] Implement firmware line framing, size cap, version negotiation, heartbeat, resync.
- [ ] Implement bridge serial lifecycle: open, close, reconnect with backoff, snapshot on reconnect.
- [ ] Implement state reducer with the documented priority, unit-tested.
- [ ] Implement metrics deduplication and out-of-order protection.
- [ ] Implement mock adapter and simulator; both labelled as non-production.
- [ ] Implement `buddy doctor` diagnostics with sanitized output.
- [ ] Implement configuration validation with safe defaults.
- [ ] Bind loopback only and reject unauthenticated state changes.

## Dependencies

Phase 1 firmware serial skeleton. Node.js ≥ 20.

## Acceptance criteria

- Handshake succeeds with the real device; a full snapshot is sent after every reconnect and device reset.
- 2048-byte boundary and malformed input rejected without reboot or desync.
- Sequence gap triggers resync; duplicates are ignored.
- Eight-hour simulated soak with periodic resets shows stable memory and no missed heartbeats.
- Bridge continues running with no device and with no OpenCode.

## Testing requirements

- Unit tests: codec, reducer, metrics, config validation.
- Integration tests: handshake, reconnect, resync, boundary, port-busy error.
- Fuzz tests for both parsers.
- Reproducible command list and logs in the phase report.

## Expected deliverables

- `bridge/` implementation with tests and pinned dependencies.
- Firmware serial/protocol modules with tests where host-testable.
- `simulator/` with documented scenarios.
- Protocol v1 frozen specification and test vectors.
- Phase 2 report.

## Gate

Protocol and bridge demonstration with the simulator and, if approved, the device.
