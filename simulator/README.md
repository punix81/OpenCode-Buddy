# Simulator

Status: **not implemented** — Phase 2.

Purpose: develop and demo the bridge and the screens without OpenCode or physical hardware.

Planned capabilities:

- Virtual serial port or in-process loopback that speaks protocol v1.
- Scenario player: idle → thinking → tool working → permission → success, and failure / retry /
  compaction / multi-session variants.
- Protocol inspector: decoded messages, sequence numbers, byte sizes, warnings.
- Boundary harness: 2047/2048/2049-byte lines, invalid JSON, unknown types, version mismatch.
- Always identifiable as a simulator in logs and on the System screen (`SIM`), never mistaken for a
  real device.

Constraint: the simulator must reuse the bridge's real codec and reducer, so the tested path is the
shipped path.
