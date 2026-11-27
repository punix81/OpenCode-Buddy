# OpenCode Buddy

A physical desktop companion for [OpenCode](https://opencode.ai) v2.

OpenCode Buddy shows, in real time, what your AI coding agent is doing: thinking, calling tools,
waiting for a permission, failing, compacting its context, or finishing successfully. It combines an
animated virtual companion with a compact developer dashboard on a 1.28" round display, driven by an
ESP32-C3 over USB.

> **Project status (2026-11-27): SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED to
> Phase 6.** RC1 `dd7d1d57…` is frozen and code-identical to the clean rebuild `f9cc72ee…`; the
> Phase 4.1 image `2ff67b71…` remains the verified device baseline. The Product Owner stopped USB
> investigations in the VMware/Ubuntu USB-redirection environment: it is **not** the reference
> environment for hardware acceptance, and **no root cause is claimed** (VMware is not confirmed as
> the cause). Cold boots, USB reconnections, soak, endurance and the six-screen hardware matrix move
> to Phase 6 on native physical Windows/Linux. Phase 6 Checkpoint A (native compatibility and
> installation) is in progress: Windows Named Pipes
> and Linux IPC behind one abstraction, deterministic ESP32 discovery, JSONC-safe plugin
> installation, user configuration, startup definitions, portable packaging and firmware manifest
> verification. Checkpoints B/C/D (native hardware acceptance) are not authorized. See
> [docs/phase-5-report.md](docs/phase-5-report.md),
> [docs/handover-phase5.md](docs/handover-phase5.md),
> [docs/phase-6-architecture.md](docs/phase-6-architecture.md) and
> [docs/phase-6-plan.md](docs/phase-6-plan.md).

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

## Quick start

```sh
cd bridge
npm ci
npm run live          # LIVE: real OpenCode events (default mode)
npm run mock -- --scenario all-states   # MOCK: development only
npm run diagnose      # USB device and link
npm run diagnose:opencode  # plugin, IPC, OpenCode version
node ../scripts/install-buddy-plugin.mjs   # prints the exact plugin entry
```

LIVE mode requires the OpenCode plugin to be configured (see
[docs/plugin-installation.md](docs/plugin-installation.md)); without it the device stays IDLE/OFFLINE
and never receives simulated data.

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
| `docs/` | Requirements, architecture, audits, reports, Phase 6 plan | Phase 0 → 6 |
| `protocol/` | NDJSON protocol v1 specification, schema, examples, vectors | Ratified |
| `firmware/` | ESP32-C3 firmware (PlatformIO, Arduino, C++), six screens, EN/FR/DE | Phase 5 RC1 |
| `bridge/` | TypeScript/Node.js local bridge, mock adapter and simulator CLI | Phase 5 |
| `plugin/` | OpenCode v2 server plugin | Phase 5 |
| `simulator/` | Hardware-free device simulator (implemented in `bridge/`) | Phase 2 |
| `hardware/` | Wiring, bill of materials, enclosure notes | Phase 0 |
| `scripts/` | Reproducible maintenance scripts | Phase 5 |

## Dashboard and preferences

The six screens are Buddy, Session, Tokens, Tools, MCP Radar and System. All fixed labels are
available in English, French and German; the language can be overridden in the local bridge
configuration without a reboot and is persisted on the device. Tokens are labelled **SESSION TOTAL**
and never presented as context occupancy (`CTX --`). The MCP radar shows at most eight details while
keeping the complete online/total counts. See [dashboard metrics](docs/dashboard-metrics.md),
[localization](docs/localization.md) and [device preferences](docs/device-preferences.md).

## Documentation

- [Requirements](docs/requirements.md)
- [Architecture and decisions](docs/architecture.md)
- [UI and interaction design](docs/ui-design.md)
- [Dashboard metrics](docs/dashboard-metrics.md)
- [Localization](docs/localization.md)
- [Device preferences](docs/device-preferences.md)
- [Security and privacy](docs/security.md)
- [Hardware audit](docs/hardware-audit.md)
- [OpenCode v2 API audit](docs/opencode-api-audit.md)
- [Protocol v1 (ratified)](protocol/protocol-v1.md) · [Ratification review](protocol/ratification-v1.md)
- [Bridge guide](bridge/README.md) · [Simulator guide](simulator/README.md)
- [Roadmap](docs/roadmap.md)
- [Installation](docs/installation.md) · [Troubleshooting](docs/troubleshooting.md)
- [Phase 0 report](docs/phase-0-report.md) · [Phase 1 report](docs/phase-1-report.md) ·
  [Phase 2 report](docs/phase-2-report.md) · [Phase 3.1 report](docs/phase-3-1-report.md) ·
  [Phase 4 plan](docs/phase-4-plan.md) · [Phase 4 report](docs/phase-4-report.md)
- [Phase 5 report](docs/phase-5-report.md) · [Phase 5 handover](docs/handover-phase5.md) ·
  [Phase 5 USB diagnostics](docs/evidence/phase-5-usb-diagnostics.md) ·
  [Preserved artifacts](docs/evidence/phase-5-artifacts.md)
- [Phase 6 architecture](docs/phase-6-architecture.md) · [Phase 6 plan](docs/phase-6-plan.md) ·
  [Installation](docs/installation.md) · [Configuration](docs/configuration.md) ·
  [Firmware management](docs/firmware-management.md)

## Contributing

Read [AGENTS.md](AGENTS.md) (engineering rules and hard constraints) and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.

## License

See [LICENSE](LICENSE). The file is inherited from the initial commit (MIT); the final licensing
decision is pending explicit owner approval and has not been changed by this phase.
