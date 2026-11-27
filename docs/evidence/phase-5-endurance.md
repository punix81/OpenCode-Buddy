# Phase 5 — endurance and soak

Date: 2026-11-27. Status: **DEFERRED TO PHASE 6 — NOT RUN.** No 3600 s soak or 28 800 s endurance
was executed on the Phase 5 bridge or on a Phase 5 RC image. The Product Owner stopped hardware
validation in the Windows-host + VMware Ubuntu USB-redirection environment; it is not the reference
environment and no USB root cause is claimed.

## Why

Phase 5 hardware validation is deferred to Phase 6 on a native physical host. The USB diagnostic
campaign did not produce a validated handshake fix, and the current VMware/Ubuntu USB-redirection
setup is not the reference environment. Running a soak here would not be acceptance evidence; the
previous 4.1 soak on `58bd386` is **not** evidence for the Phase 5 bridge (`c4db0b3`, 126/126).

## What the soak must cover (when the blocker is fixed and the RC is approved)

- MOCK only for the 3600 s soak and the 28 800 s endurance, to avoid LLM cost.
- Twelve states, at least three sessions, twelve MCP servers with eight details, changing MCP
  statuses, permission and question lifecycles, high token values and frames near the limits.
- Independent error injections separated from the stable endurance.
- ACKs, errors, resets, resyncs, reconnects, RSS/CPU and memory; diagnostic-only metrics documented
  separately.
- Restore LIVE at the end.

## Gates transferred to Phase 6

- 3600 s soak: **not executed** — Phase 6.
- 28 800 s endurance: **not executed** — Phase 6.
- 20 genuine cold boots, 10 software reboots, 10 bridge restarts, 10 USB reconnections: **not
  executed on the RC** — Phase 6 on native physical Windows/Linux. The 2026-11-27 campaign includes
  one genuine power cycle (USB device 22) and three software resets; they do not replace the 20 cold
  boots.

The harnesses `tools/qa/soak_monitor.py` and `tools/qa/cold_boot_log.py` remain available. No PASS is
claimed. Plan: `docs/phase-6-plan.md`.
