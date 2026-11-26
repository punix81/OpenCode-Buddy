# Phase 4.1 — soak test

Status: **NOT RUN**.

## Why

The one-hour soak is the last gate of Phase 4.1 and must run on the final image with the final
bridge. The hardware session was stopped by the Product Owner before the final cold-boot series, so
the candidate was not yet cleared for a soak. Running a 3600 s MOCK soak on an image that has not
passed its cold-boot gate would not produce acceptance evidence.

## What is required

- Image D `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2`, verified on the device.
- Bridge `2509de8` (handshake retry, 103/103 tests).
- Explicit MOCK stress (`npm run mock` or the simulator scenario) for at least 3600 s, then LIVE.
- Scenario: the twelve companion states, twelve MCP servers with eight graphical details, MCP status
  changes, high token counts, long model/agent identifiers, permission/question lifecycle, several
  simulated sessions, reconnects, large frames, dashboard rendering, language changes.
- Recorded every 60 s: ACK latency and expiries, device errors, resyncs, RX/TX saturation, resets,
  bridge RSS, heap, frame render time. Fault-injection errors are listed separately from idle errors.
- The 8 h endurance run stays a Phase 5 requirement.

## Previous soak

The Phase 3.1 MOCK stress soak passed before the bridge changes of Phase 4. It is not evidence for
Phase 4.1 and must not be cited as such.

## Exit criteria

- 3600 s without an unexplained error, resync, reset or ACK expiry.
- No TX drop and a bounded heap on the device.
- Bridge RSS growth bounded.
- Return to LIVE and a verified handshake with real OpenCode data.
