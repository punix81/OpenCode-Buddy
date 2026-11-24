# OpenCode Buddy

A physical desktop companion for [OpenCode](https://opencode.ai) v2.

OpenCode Buddy shows, in real time, what your AI coding agent is doing: thinking, calling tools,
waiting for a permission, failing, compacting its context, or finishing successfully. It combines an
animated virtual companion with a compact developer dashboard on a 1.28" round display, driven by an
ESP32-C3 over USB.

> **Project status: Phase 0 approved. Phase 1 complete — PASS WITH RESERVATIONS: firmware validated
> on the panel, device restored to the reference firmware. Phase 2 is planned and awaits approval;
> no bridge or plugin is implemented yet.**
> See [docs/phase-0-report.md](docs/phase-0-report.md),
> [docs/phase-1-report.md](docs/phase-1-report.md) and
> [docs/phase-2-plan.md](docs/phase-2-plan.md).

## Why

Developers running long agent sessions switch to the terminal to check progress and to answer
permission prompts. A $10 companion on the desk removes most of that context switching, without
sending any prompt, response, tool argument or file content anywhere: the device only ever receives
normalized state and counters.

## Hardware

| Part | Details |
| --- | --- |
| MCU | ESP32-C3 Super Mini (RISC-V, native USB) |
| Display | GC9A01 circular IPS, 1.28", 240 × 240 px, SPI |
| Input | TTP223 capacitive touch sensor (single pad) |
| Link | USB-C data cable, USB CDC serial |

Wiring is identical to the pre-existing `Codex-Quota-Mini` reference build and is documented, with
its source evidence, in [hardware/wiring.md](hardware/wiring.md).

## Architecture

```text
OpenCode v2 server
   │  in-process plugin events (official @opencode/plugin)
   ▼
OpenCode Buddy plugin          normalized, allowlisted events only
   │  loopback-only IPC
   ▼
Local TypeScript bridge        state reducer, metrics, privacy filter
   │  versioned NDJSON over USB CDC
   ▼
ESP32-C3 firmware              serial, protocol, state, screens, animations
   │
   ▼
GC9A01 display  +  TTP223 gestures
```

The device renders animations locally. No image frames, prompts, code, paths or tool arguments are
transmitted. See [docs/architecture.md](docs/architecture.md).

## Repository layout

| Path | Purpose | Status |
| --- | --- | --- |
| `docs/` | Requirements, architecture, audits, reports | Phase 0 |
| `protocol/` | NDJSON protocol v1 specification and schemas | Design draft |
| `firmware/` | ESP32-C3 firmware (PlatformIO, Arduino, C++) | Phase 1 |
| `bridge/` | TypeScript/Node.js local bridge | Phase 2 |
| `plugin/` | OpenCode v2 server plugin | Phase 3 |
| `simulator/` | Hardware-free device simulator | Phase 2 |
| `hardware/` | Wiring, bill of materials, enclosure notes | Phase 0 |
| `scripts/` | Reproducible maintenance scripts | Phase 0 |

## Documentation

- [Requirements](docs/requirements.md)
- [Architecture and decisions](docs/architecture.md)
- [UI and interaction design](docs/ui-design.md)
- [Security and privacy](docs/security.md)
- [Hardware audit](docs/hardware-audit.md)
- [OpenCode v2 API audit](docs/opencode-api-audit.md)
- [Protocol v1 (draft)](protocol/protocol-v1.md)
- [Roadmap](docs/roadmap.md)
- [Installation](docs/installation.md) · [Troubleshooting](docs/troubleshooting.md)
- [Phase 0 report](docs/phase-0-report.md)

## Contributing

Read [AGENTS.md](AGENTS.md) (engineering rules and hard constraints) and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.

## License

See [LICENSE](LICENSE). The file is inherited from the initial commit (MIT); the final licensing
decision is pending explicit owner approval and has not been changed by this phase.
