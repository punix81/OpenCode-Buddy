# Simulator

The Phase 2 simulator lets the bridge and the protocol be exercised **without OpenCode and without
hardware**. The implementation lives in `bridge/src/simulator/` and `bridge/src/adapters/mock.ts`.

## Device simulator + bridge (no hardware)

```sh
cd bridge
npm run simulate -- --scenario full-session --duration 20000
```

This runs a device-side protocol emulator and the bridge over an in-memory transport. It performs the
real handshake (`hello`/`ready`/`config`/`state`/`mcp_status`), heartbeats, acknowledgements and state
snapshots. Every state carries `source: "mock"`, which the firmware renders as `MOCK`.

## Scenarios

| Scenario | What it exercises |
| --- | --- |
| `full-session` | thinking → tool → generating → success → idle |
| `permission` | permission request, reply, tool completion, success |
| `multi-session` | two concurrent sessions, one blocked on permission |
| `error` | tool failure, then execution failure |
| `all-states` | permission, question, retry, compaction, success, interrupted, idle |

## With hardware

```sh
cd bridge
npm run mock -- --scenario full-session --port /dev/ttyACM0
```

The mock adapter feeds the bridge; the bridge sends real protocol messages to the device. The device
shows the scenario with its `MOCK` badge. No OpenCode process is involved.

## What the simulator does not do

- It is not a fake hardware driver: it never opens a serial port.
- It never claims to be live data; all state is `source: "mock"`.
- It does not simulate electrical faults, display artefacts or touch timing; those require the real
  device.
