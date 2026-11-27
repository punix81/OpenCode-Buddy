# Phase 5 — endurance and soak

Date: 2026-11-27. Status: **NOT RUN.** No 3600 s soak or 28 800 s endurance was executed on the
Phase 5 bridge or on a Phase 5 RC image.

## Why

The USB diagnostic campaign (2026-11-27) did not produce a validated handshake fix. After a
watchdog/flash reset the device's USB CDC RX can deliver 0/16 host bytes and no ACK; a real power
cycle restores the link. Running a soak on an image that cannot reliably start would only record a
known failure, and the previous 4.1 soak on `58bd386` is **not** evidence for the Phase 5 bridge
(`c4db0b3`, 126/126 tests).

## What the soak must cover (when the blocker is fixed and the RC is approved)

- MOCK only for the 3600 s soak and the 28 800 s endurance, to avoid LLM cost.
- Twelve states, at least three sessions, twelve MCP servers with eight details, changing MCP
  statuses, permission and question lifecycles, high token values and frames near the limits.
- Independent error injections separated from the stable endurance.
- ACKs, errors, resets, resyncs, reconnects, RSS/CPU and memory; diagnostic-only metrics documented
  separately.
- Restore LIVE at the end.

## Gates

- 3600 s soak: **not executed**.
- 28 800 s endurance: **not executed**.
- 20 genuine cold boots, 10 software reboots, 10 bridge restarts, 10 USB reconnections: **not
  executed on the RC**; the 2026-11-27 campaign includes one genuine power cycle (USB device 22) and
  three software resets (flash/watchdog), which do not replace the 20 cold boots.

The harnesses `tools/qa/soak_monitor.py` and `tools/qa/cold_boot_log.py` remain available. No PASS is
claimed.
