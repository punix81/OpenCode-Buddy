# Phase 4 — developer dashboard, localization and preferences

Date: 2026-11-26
Baseline: `8bf3e08` (Phase 3.1 accepted and on the device)
Status: **software complete — automated validation PASS; hardware validation pending owner approval**
No flash was performed. No GitHub operation was performed. Phase 5/6 were not started.

## 1. Verdict

Phase 4 delivers the six-dashboard developer view, centralized English/French/German localization,
device-owned preferences with an explicit host workflow, and the optional OpenCode version. The
automated suites, protocol validation, host firmware suites, preview pixel tests and a clean release
build pass. The only unverified area is the physical panel: accented-glyph legibility, colour
separation and touch behaviour on the **Phase 4** image require an approved flash.

The device still runs the validated Phase 3.1 release
`280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad`. The Phase 4 image is built,
hashed and preserved in the build directory only.

## 2. Disposition against P4-01…P4-10

| Item | Status | Evidence |
| --- | --- | --- |
| P4-01 audit and baseline | DONE | `docs/phase-4-plan.md`; baseline suites re-run before changes |
| P4-02 Buddy screen | DONE | State/interaction labels with counts, retry attempt on the face, model/agent, source footer |
| P4-03 Session dashboard | DONE | One focus session for model/agent/duration/state, active-session count; duration frozen on terminal and zero when idle |
| P4-04 Tokens | DONE | `SESSION TOTAL`, IN/OUT, k/M/B, unknown `--`; `CTX --` retained; reasoning/cache internal; wide total in 64-bit |
| P4-05 Tools | DONE | Focus-session counters, deduplicated running/success/failure, six categories, no arguments/paths |
| P4-06 MCP Radar | DONE | Six status classes, stable aliases, complete totals, `n/total shown` subset caption, 12-configured/8-detail test, separate tick |
| P4-07 System | DONE | USB, bridge, OpenCode, optional OpenCode version, firmware, bridge version, protocol, DIAG |
| P4-08 Localization | DONE | Central tables, composed accents, language switch without reboot, NVS persistence |
| P4-09 Preferences | DONE | Gestures unchanged, device ownership, explicit overrides, bounded auto-return, documented workflow |
| P4-10 Desktop preview | DONE | Seven profiles, three languages, native 240×240 sheets, before/after comparison |

## 3. Metrics decisions

The complete matrix is in `docs/dashboard-metrics.md`. The non-negotiable conclusions:

- **Session total ≠ context.** `tokens.input`/`output` are cumulative session counters verified
  against the API. `CTX` stays `--`; the reducer always emits `contextPct: null` and a test asserts
  that cumulative tokens never become a percentage.
- **No double count.** Reasoning and cache read/write are captured internally but are not in NDJSON
  v1, not displayed and never added to the total. Their overlap with input is provider-dependent and
  not verified.
- **Wide totals.** When `input + output > 4294967295`, the bridge omits the uint32 `total` field and
  the firmware derives the 64-bit sum. A clamped total would contradict the larger IN/OUT.
- **Tool categories.** OpenCode v2 does not expose an authoritative category in the consumed events;
  the verified tool name is the only metadata, and the rule table is tested. No arguments, commands
  or paths leave the plugin.
- **MCP.** Complete totals are separate from at most eight details; the radar states when the subset
  is incomplete. The detail frame is sent on the next tick and only when it changes.

## 4. Localization and preferences

- `firmware/src/Localization.{h,cpp}` holds complete en/fr/de tables and typed format helpers.
- Accents are composed from the pinned fonts with primitive marks placed on the measured cap/x-height
  (or below the baseline for a cedilla), preserving the Codex Astra typography with no new font.
- The language override is applied in the next frame, stored in NVS only on change, and survives
  bridge restart, USB reconnect and MCU reboot. The very-long press resets to English/loud/Buddy.
- Gestures are unchanged. The supported workflow is `config.local.json` (`language`, `quietMode`,
  `autoReturnSeconds`, `allowRealMcpNames`) plus the existing gestures; no graphical settings app was
  added. See `docs/device-preferences.md`.
- `autoReturnSeconds` (10–600 s, default 60) is now applied by the firmware instead of being ignored.

## 5. Preview and visual review

`tools/ui-preview` was extended, not replaced. Native 240×240 sheets:

| File | Content |
| --- | --- |
| `docs/design/previews/screens.png` | six dashboards, English |
| `screens-fr.png`, `screens-de.png` | six dashboards, French/German |
| `missing.png` | unavailable metrics, offline source |
| `extremes.png` | max counters, 8.6B total, long model, 65535 sessions |
| `offline.png` | retained snapshot, LAST SNAPSHOT/STALE semantics |
| `interaction.png` | Permission (3), notifications, retry |
| `mcp-12.png` | 12 configured / 8 details in three languages |
| `live.png` | LIVE footer fixture (simulated data, labelled) |
| `quiet.png` | loud vs quiet |
| `comparison-phase4.png` | Phase 3.1 sheets above Phase 4 sheets |
| `phase-3/` | preserved before sheets |

First review found four defects that were fixed before this report: accents floated above the letter
(borrowed punctuation had its own cell offset), `Version OpenCode`/`Version bridge` were truncated,
French `En cours`/`Recherche` were truncated, and the missing profile showed a `Thinking` state with
no metrics. The reviewed sheets show no clipped localized label.

## 6. Firmware changes and build

Main changes: `Localization.*`, UTF-8/accent renderer in `Theme.cpp`, localized and extended
`Dashboard.cpp`, `ScreenManager` language/auto-return, `BuddyFace` attempt label, optional
`versions.opencode` in `BuddyState.h`/`ProtocolParser.cpp`, `main.cpp` config application.

Clean release build (after removing `.pio/build/supermini`):

```
RAM:   22 604 / 327 680 B (6.9 %)
Flash: 376 260 / 1 310 720 B (28.7 %)
firmware.bin: 410 656 bytes
sha256: 741dcb5bd23f599be69296ab5c054abefdcff75c70fdf156389fc228e51ace6e
```

Delta from the Phase 3.1 release: **+32 B RAM, +4 078 B flash** (localization tables and the
accent/UTF-8 renderer). No new dependency, no new font, no wiring/GPIO/rotation change, no change to
the USB architecture or the privacy pipeline.

## 7. Automated validation

| Suite | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Bridge | **94/94** |
| Plugin | **24/24** |
| Protocol | PASS (12 valid, 14 invalid, examples verified) |
| Firmware host | protocol PASS, localization PASS, gestures PASS, TX PASS |
| Simulator | PASS (all states received) |
| Preview | **8/8** |

Details and the test-to-requirement map: `docs/evidence/phase-4-test-summary.md`.

## 8. Live verification of the new bridge

The Phase 4 bridge was started in LIVE mode against the unchanged Phase 3.1 firmware:

```
hello boot=1 caps=config.partial
config seq=2 bytes=176
state seq=... bytes=575
mcp_status seq=... bytes=407
opencode peer=1 app=cli version=2.4.1
opencode peer=2 app=cli version=2.4.1
mcp online=8 total=12
state status=thinking sessions=1 tokens=215876663/238130 source=live
device errors: 0
resync: 0
```

The optional OpenCode version is omitted because the installed firmware does not advertise the new
capability — the intended backward-compatible path. State and MCP remain separate frames. The restart
also exposed a real defect: the CLI pre-bridge sink did not implement `setOpenCodeVersion`, so the
first connection crashed when the IPC watchdog ran. It is fixed in `dbe3e61`; the final run above is
from that code.

## 9. Remaining risks and limitations

1. **Hardware not validated for Phase 4.** Accented labels, seven-row System layout, localized
   German/French widths, touch and auto-return need the panel. Host pixel sheets are not panel
   measurements.
2. **No one-hour soak of the final bridge.** Phase 5 requirement; the Phase 3.1 61-minute soak used
   the earlier bridge.
3. **Context occupancy/capacity unknown.** `CTX --` is intentional; no percentage is invented.
4. **Tool categories** rely on the verified tool name; OpenCode exposes no authoritative category in
   the consumed events.
5. **Multiple OpenCode peers with different versions:** the System row shows the most recent hello's
   version. Normal single-peer use is unambiguous.
6. **Live permission/question prompts** were not observed in real traffic (no safe trigger); they are
   covered by reducer and protocol tests.
7. Windows named pipes remain out of scope until Phase 6.

## 10. Proposed hardware validation procedure (approval required)

1. Read the full 4 MiB flash and record its hash; keep the Phase 3.1 release image and the pre-flash
   dumps in `.backups/`.
2. Flash **application-only** at `0x10000` with esptool 5.7.0 `--no-stub`; perform an independent
   read-back and compare the SHA-256 with `741dcb5b…`.
3. Boot with the bridge LIVE. Confirm `hello` advertises `config.partial` and
   `state.opencodeVersion`, the config is 176 B, state/MCP frames are separate, and no `device error`
   or resync appears.
4. Check the six dashboards in English; then set `language` to `fr` and `de` in `config.local.json`
   and restart the bridge: the panel must repaint without a reboot. Restart the bridge, replug USB and
   reset the MCU; the language must persist.
5. Verify System shows `2.4.1` (capable firmware), MCP shows `8/12` and the subset caption, and Tokens
   shows `SESSION TOTAL` with `CTX --`.
6. Check gestures: short advances, double returns, long toggles quiet once, very-long resets once and
   returns to English/loud/Buddy. Set `autoReturnSeconds: 90` and verify the return from a dashboard.
7. Record panel photos, logs, frame sizes, ACK latency and any visual defect. Roll back by reflashing
   the preserved Phase 3.1 application image if a blocker appears.

## 11. Local commits

```
ecc6e45 test(preview): cover languages, profiles and MCP subsets
dbe3e61 feat(bridge): expose the OpenCode version and apply auto-return
da26995 feat(firmware): localize the six dashboards and complete their metrics
```

The documentation commit follows these three. All commits are local; nothing was pushed, fetched or
published. GitHub remains the Product Owner's responsibility.

## 12. Final state

- Device: Phase 3.1 release `280166…e12ad`, operational.
- Bridge: **LIVE** with the Phase 4 code, two OpenCode peers, MCP 8/12, 0 device error, 0 resync.
- Phase 4 image: built and hashed, **not flashed**.
- Phase 4 software: ready for the approval gate.
- Phase 5 and Phase 6: not started.
- No GitHub operation, no secret, no global OpenCode configuration change.
