# Phase 4 — test summary

Date: 2026-11-26
Baseline commit: `8bf3e08` (Phase 3.1 accepted). Firmware on the device: Phase 3.1 release
`280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` — **not replaced**.

## 1. Automated suites

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript typecheck | `npm run typecheck` (bridge) | PASS, 0 diagnostics |
| Bridge tests | `npm test` / `npx tsx --test test/*.test.ts` | **94/94** |
| Plugin tests | `npm run test:plugin` | **24/24** |
| Protocol validation | `npm run validate:protocol` | PASS (12 valid, 14 invalid, examples verified) |
| Firmware protocol host test | `bash firmware/test/host/run.sh` | PASS |
| Firmware localization host test | same | PASS |
| Firmware gesture host test | same | PASS |
| Firmware TX buffer host test | same | PASS |
| Simulator | `npm run simulate -- --scenario all-states --duration 3000` | PASS, all states received |
| Preview | `python3 -m unittest -q test_preview.py` | **8/8** |

## 2. New or extended tests

| Requirement | Test |
| --- | --- |
| Localization completeness, accents, placeholders | `firmware/test/host/test_localization.cpp` |
| Interaction count suffix | `test_localization.cpp` (`Permission (3)`, `Saisie requise (1)`) |
| Language mapping bounds | `test_localization.cpp` (`languageFrom(9)` → English) |
| State and MCP never share a burst | `the MCP detail is staggered after the state frame` |
| MCP details only when changed | `an unchanged MCP detail is not resent on every state tick` |
| 12 MCP servers, 8 details, bounded frames | `twelve MCP servers keep eight details, complete totals and bounded frames`; IPC test raised to 12 servers |
| Optional OpenCode version | `the OpenCode version is optional and capability-gated`; firmware `opencode version accepted/unknown/too long`; `hello carries state.opencodeVersion` |
| Wide token total | `a total wider than uint32 is omitted so the device derives it`; firmware `derived total is 64-bit` |
| Context never derived from totals | `cumulative session tokens never become a context percentage` |
| Interruption duration | `interruption freezes the duration for its notification, then clears it` |
| Gesture exclusivity | `test_touch.cpp` now polls twice after `VeryLong` and asserts no second action |
| Preferences workflow | `auto return is bounded by the protocol limits`; existing legacy/partial override tests |
| Backward compatibility | firmware accepts state without `opencode`; bridge omits it to a legacy hello; protocol schema accepts both |
| Visual languages/profiles | `test_preview.py`: all six dashboards change per language, safe disc, 12/8 MCP, offline/LIVE footers, 240×240 |

## 3. Firmware build

Clean build after removing `.pio/build/supermini`:

```
RAM:   22 604 / 327 680 B (6.9 %)
Flash: 376 260 / 1 310 720 B (28.7 %)
firmware.bin: 410 656 bytes
sha256: 741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e
```

Baseline Phase 3.1 release: 22 572 B RAM, 372 182 B flash. Delta: **+32 B RAM, +4 078 B flash**.
The flash growth is the localization tables and accent/UTF-8 renderer.

**No upload, no flash, no device reset was performed.**

## 4. Live bridge verification

The running Phase 3.1 bridge was replaced with the Phase 4 bridge (same LIVE defaults) against the
unchanged Phase 3.1 firmware:

```
hello boot=1 caps=config.partial
config seq=2 bytes=176
state bytes=575
mcp_status bytes=407
opencode peer=1 version=2.4.1
opencode peer=2 version=2.4.1
mcp online=8 total=12 source=live
state status=thinking sessions=1 tokens=215876663/238130 source=live
device errors: 0
resync: 0
```

The device does not advertise `state.opencodeVersion`, so the optional field is omitted by design;
`config` remains partial and the device keeps its preferences. The first restart exposed a real
defect: the CLI pre-bridge sink lacked `setOpenCodeVersion`, so the IPC watchdog crashed the process
after the peers connected. Fixed in `dbe3e61` (the sink retains the version and forwards it once the
serial bridge exists); the final run above is from the fixed code. Hardware validation of the Phase 4
UI is pending approval.

## 5. Not exercised

- Phase 4 firmware on hardware (flash not approved).
- A full one-hour soak with the final bridge (Phase 5 requirement).
- Live `permission.asked` / `form.created` prompts (no safe trigger).
- Two simultaneous active executions; a second provider.
- Windows named pipes.
