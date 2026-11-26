# Phase 3.1 — audit remediation and hardware validation report

Date: 2026-11-26
Audited baseline: `e7a8cb71da0a049f7d09caa8eb5f95fa6af11943`
Verdict: **PASS — Phase 3.1 is complete. Code, automated tests, firmware flash, soak and physical
validation are recorded. Phase 4 has not started.**
Companion documents: `docs/audit-phase-3-1.md` (finding dispositions),
`docs/evidence/phase-3-1-test-summary.md`, `docs/evidence/phase-3-1-hardware-validation.md`,
`docs/evidence/phase-3-1-soak-test.md`, `docs/evidence/phase-3-1-performance.md`.

## 1. Final state

| Item | Value |
| --- | --- |
| Firmware installed | Phase 3.1 release, sha256 `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` |
| Firmware flash | application only at `0x10000`; bootloader, partitions and NVS untouched; write and read-back verified |
| Bridge | LIVE, real OpenCode 2.4.1 data, `source=live`, `mcp online=8 total=12` |
| Design | Codex Astra visual design unchanged; six screens and gestures intact |
| GitHub | no operation performed |
| Phase 4 | not started |

## 2. Disposition matrix

Legend: **C** code fixed, **A** automated test, **H** hardware verified, **L** live OpenCode verified.

| ID | C | A | H | L | Evidence / remaining gap |
| --- | --- | --- | --- | --- | --- |
| F01 | yes | yes | n/a | no | permission/form live prompts not triggered; priority and identifiers tested |
| F02 | yes | yes | n/a | partial | two peers connected; a peer disappearing was not induced on the real server |
| F03 | yes | yes | n/a | **yes** | bridge equals the focus session's API tokens exactly; no aggregation |
| F04 | yes | yes | n/a | partial | real tool counters; lifecycle edges automated-only |
| F05 | yes | yes | n/a | partial | `source=ok` live; a real subscription failure was not induced |
| F06 | yes | yes | partial | partial | bridge restart clean; USB replug shows one transient handshake error, recovered in ~2 s |
| F07 | yes | yes | **yes** | n/a | second bridge refused before opening the USB port |
| F08 | yes | yes | partial | n/a | 61-min soak, 0 steady-state error; TX drops 0 in the diagnostic run; partial writes remain synthetic |
| F09 | yes | yes | n/a | partial | live 8/12; MCP reset on real disconnect not observed |
| F10 | yes | yes | **yes** | n/a | QUIET persisted across bridge restart, MCU restart, USB replug; very-long reset verified |
| F11 | yes | yes | n/a | partial | focus tokens/model match; two simultaneous active executions not induced |
| F12 | yes | no | partial | n/a | NVS only on change; persistence observed; no direct write counter |
| F13 | yes | yes | n/a | n/a | debug opt-in, not enabled on the device |
| F14 | yes | yes | n/a | partial | two peers and a probe session; a foreign-project event was not injected |

## 3. Baseline and tests

Before changes: bridge 56/56, plugin 13/13, protocol PASS, host PASS, firmware 371 804 B flash /
20 516 B RAM. Final:

| Check | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Bridge tests | **85/85** |
| Plugin tests | **24/24** |
| Protocol validation | PASS (11 valid, 13 invalid, examples verified) |
| Firmware host tests | protocol PASS, gestures PASS, TX buffer PASS |
| Simulator | PASS |
| Firmware release build | SUCCESS — 22 572 B RAM, 372 182 B flash |
| Diagnostic build | SUCCESS — 22 604 B RAM, 374 276 B flash, 408 512 B image |

## 4. Flash and protocol

- Pre-flash full backup `246122bc…a702`; app-only backup `2ee37e26…8092`.
- esptool **5.7.0**, `--no-stub`; app at `0x10000`; write hash verified; independent verify digest
  matched; watchdog reset; USB re-enumeration normal.
- New firmware hello: `caps:["config.partial"]`; the bridge sends a 176-byte `config` without
  `language`/`quietMode`; the device keeps its stored preferences.
- Handshake, heartbeats, ACK and snapshot verified; 0 configuration error and 0 resync on bridge
  restarts with the device already running.
- The release build directory was removed by the diagnostic build; the exact image was recovered from
  the device (`read-flash`), hash matched, reflashed and verified. No ambiguity about the installed
  image.

## 5. Token verification

Bridge and `GET /api/session` at the same instant:

| Instant | API | Bridge | All sessions sum |
| --- | --- | --- | --- |
| 10:04:07 | 65 161 507 / 102 508 | 65 161 507 / 102 508 | 145 348 804 |
| 10:04:47 | 68 329 545 / 104 045 | 68 329 545 / 104 045 | 148 516 842 |

Cumulative per session, max per field, reasoning 133 182, cache 0/0, no context percentage. A probe
session without execution reported 0/0 and was handled correctly. The calculation method was not
changed.

## 6. Soak

`docs/evidence/phase-3-1-soak-test.md`: **PASS**, 3 660.4 s, stress MOCK (explicitly chosen; no
DeepSeek cost), 3 647 state frames, 7 295 ACKs (avg 65 ms, max 490 ms), 0 expired, 0 resync, 0
steady-state error, RSS constant at 56 404 kB, all nine states. One invalid line at the very first
message (buffered hello burst) led to the handshake-ACK gate fix; the soak steady state is valid.

## 7. Performance

`docs/evidence/phase-3-1-performance.md`: **PARTIAL**, 4.5 min of valid diagnostic samples before a
physical USB re-enumeration interrupted the capture (firmware alive, `boot=1`, `reset=poweron`).
Heap 245 812 B constant, max block 225 268 B constant, FPS average 18 / max 21, render average
47.2 ms / max 48.1 ms, 0 TX drops, all 12 states. The release image has no diagnostics; the 61-min
soak covers its stability. A full 15-minute diagnostic run remains an optional follow-up, not a
blocker.

## 8. Physical validation (Product Owner)

| Step | Result |
| --- | --- |
| Bridge restart with QUIET active | PASS — QUIET preserved |
| MCU restart with QUIET active | PASS — QUIET preserved |
| USB unplug/replug | PASS — `reconnecting` → 4 backoff attempts → hello/caps → ready; screen returned; QUIET preserved |
| Very long press | PASS — `interaction gesture=very_long` logged; RESET, Buddy, QUIET disabled |
| Long press | `interaction gesture=long` logged at 13:49:49 |

Residual: the USB **power-cycle** produced one transient `E_PARSE` + resync while the device booted;
the bridge resent `config`, the device acknowledged, and the LIVE view returned in about 2 s. No later
error. Bridge restarts with the device already running are clean. Documented in
`docs/evidence/phase-3-1-hardware-validation.md` §9.

## 9. Firmware changes

| File | Reason |
| --- | --- |
| `TxBuffer.h` (new) | bounded 2048-byte staging; partial Serial writes retried; no truncated NDJSON line |
| `main.cpp` | FrameWriter targets TxBuffer; one bounded flush per loop; no blocking |
| `ProtocolParser.*` | optional `config` preferences + `caps:["config.partial"]` |
| `PreferencesManager.cpp` | NVS writes only on change |
| tests | TX buffer, config-without-preferences |

## 10. Security

IPC PID lock, 0700 real directory, no symlink, non-socket path refusal, 0600 token/socket, UTF-8
bounds, rate limit. Plugin diagnostics private (0700/0600, 1 MiB cap, sanitized). Ownership policy
rejects foreign locations, unknown sessions and location-less `session.created`. No permission
approval, prompt, tool execution or file write added to the plugin. Documentation contains no home
directory, proxy or board identifier.

## 11. Remaining limitations

1. USB power-cycle: one transient handshake error, automatic recovery (documented).
2. Diagnostic performance run: 4.5 valid minutes instead of 15 (physical USB interruption); optional
   follow-up.
3. Live `permission.asked` / `form.created` prompts still not observed (no safe trigger).
4. Two simultaneous **active** executions not induced.
5. One provider (DeepSeek) end-to-end.
6. Windows named pipes not implemented.

## 12. Local commits

```
be2b803 fix(bridge): gate the first snapshot on the handshake acknowledgement
4ffb144 fix(test): make the stress soak resolve interactions and avoid late tool revival
0d199ac fix(bridge): refuse a second bridge before opening USB and pace state frames
0cfcec5 docs: record the Phase 3.1 audit remediation
2d22033 fix(firmware,bridge): stage serial frames, keep device preferences and recover the link
8b1c895 fix(plugin): supervise the event stream and bound what leaves the server
828d5d9 fix(ipc): enforce a single bridge and own sessions per OpenCode peer
3ad8d48 fix(state): separate interactions from activity and scope metrics to one session
```

The Phase 3.1 validation documentation is committed separately. Nothing was pushed; remote
publication remains the Product Owner's responsibility.

## 13. Recommendation

Accept Phase 3.1. The release firmware is installed, the bridge is LIVE, backups are preserved, and
the only residual hardware item is the documented USB-power-cycle handshake transient with automatic
recovery. Phase 4 may start only after the Product Owner's explicit approval.
