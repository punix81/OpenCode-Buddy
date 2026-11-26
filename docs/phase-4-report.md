# Phase 4 — developer dashboard, localization and preferences

Date: 2026-11-26
Baseline: `8bf3e08` (Phase 3.1 accepted), final local `1b43a6a`
Status: **FAIL — BLOCKER USB CDC RX on the Phase 4 image. Phase 3.1 restored and LIVE.**
The Phase 4 software and UI passed automated and physical checks; the Phase 4 image did not reliably
accept `ready`/`config` after boot and cannot be accepted. The previously validated Phase 3.1 image
`280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` is installed and verified. No
diagnostic image remains. No GitHub operation; Phase 5/6 not started.

## 1. Verdict

**Phase 4 hardware gate: FAIL (BLOCKER).** The six dashboards, EN/FR/DE localization, preferences,
gestures, auto-return, MOCK interaction layouts and the renderer were validated physically on the
Phase 4 image while it was alive. The USB CDC RX then failed on the Phase 4 image after cold boots:
the device sent `hello`/heartbeats but never ACKed `ready`/`config`, with no device error or resync.
The same host, cable, bridge and procedure with the Phase 3.1 image handshook immediately. This
isolates the blocker to the Phase 4 image or its boot/USB interaction.

The Phase 4 image is preserved for Phase 5; it is **not** installed. Phase 3.1 is installed and the
bridge is LIVE. The software report remains valid; the hardware acceptance does not.

## 2. Disposition against P4-01…P4-10

| Item | Status | Evidence |
| --- | --- | --- |
| P4-01 audit and baseline | DONE | `docs/phase-4-plan.md`; baseline suites re-run before changes |
| P4-02 Buddy screen | DONE | State/interaction labels with counts, retry attempt on the face, model/agent, source footer |
| P4-03 Session dashboard | DONE | One focus session for model/agent/duration/state, active-session count; duration frozen on terminal and zero when idle |
| P4-04 Tokens | DONE | `SESSION TOTAL`, IN/OUT, k/M/B, unknown `--`; `CTX --` retained; reasoning/cache internal; wide total in 64-bit |
| P4-05 Tools | DONE | Focus-session counters, deduplicated running/success/failure, six categories, no arguments/paths |
| P4-06 MCP Radar | DONE | Six status classes, stable aliases, complete totals, `n/total shown` subset caption, 12-configured/8-detail test, separate tick |
| P4-07 System | DONE software; hardware BLOCKER | Seven rows and optional OpenCode version verified; the Phase 4 USB link itself is blocked (see §13) |
| P4-08 Localization | DONE | Central tables, composed accents, language switch without reboot, NVS persistence |
| P4-09 Preferences | DONE | Gestures unchanged, device ownership, explicit overrides, bounded auto-return, documented workflow |
| P4-10 Desktop preview | DONE | Seven profiles, three languages, native 240×240 sheets, before/after comparison |
| Physical gate | **FAIL / BLOCKER** | USB CDC RX on the Phase 4 image; Phase 3.1 restored |

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
the USB architecture or the privacy pipeline. The Phase 4 hardware gate nevertheless failed at the
USB CDC RX level; see §8/§10.

## 7. Automated validation

| Suite | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Bridge | **102/102** |
| Plugin | **24/24** |
| Protocol | PASS (12 valid, 14 invalid, examples verified) |
| Firmware host | protocol PASS, localization PASS, gestures PASS, TX PASS |
| Simulator | PASS (all states received) |
| Preview | **8/8** |

The bridge suite grew with the V02/V04 regressions and the USB boot-robustness tests: a token counter
wider than uint32 becomes unknown rather than being clamped or dropping the event; multiple peers
with different OpenCode versions leave the version unknown; the bridge drains the no-host backlog,
primes the CDC endpoint, delays the handshake, skips duplicate-heartbeat ACKs and reopens the link
when ready/config are not acknowledged. Details: `docs/evidence/phase-4-test-summary.md`.

## 8. Live verification and USB blocker

The Phase 4 bridge (with the robustness fixes) is LIVE against the restored Phase 3.1 image:

```
hello boot=1 caps=config.partial (140 B)
config seq=2 bytes=176
ack received ack=1, ack=2
opencode peer=1 version=2.4.1
mcp online=8 total=12
state status=thinking sessions=1 tokens=367439804/301509 source=live
device errors: 0
resync: 0
```

Against the Phase 4 image, the same bridge and device produced `hello` (164 B, caps
`config.partial,state.opencodeVersion`) and heartbeats but **no ACK** for `ready`/`config`, on
multiple cold boots, even with a 2.5 s settle, a 1 s handshake delay, a blank prime and the 7 s
no-ACK reopen. A manual Python probe also got no ACK. The Phase 3.1 control handshakes immediately.
The optional OpenCode version therefore cannot be validated on the physical Phase 4 image; it remains
covered by protocol/host tests and the preview. Full evidence:
`docs/evidence/phase-4-hardware-validation.md`.

## 9. Remaining risks and limitations

1. **BLOCKER — Phase 4 USB CDC RX.** The image cannot be accepted until Phase 5 isolates whether the
   larger hello, boot rendering or a USB-stack interaction stalls RX. Phase 3.1 is installed; the
   Phase 4 image is preserved. A cold power-cycle sometimes restored RX on Phase 4, but not
   reliably; the bridge settle/no-ACK recovery did not remove the blocker.
2. **Performance dashboards.** Session/Tokens render at ~90–100 ms (above the 50 ms target); Buddy is
   47–48 ms, matching Phase 3.1. This is a Phase 5 optimization item, not the acceptance blocker.
3. **No one-hour soak of the final bridge.** Phase 5 requirement.
4. **Context occupancy/capacity unknown.** `CTX --` is intentional; no percentage is invented.
5. **Tool categories** rely on the verified tool name; OpenCode exposes no authoritative category in
   the consumed events.
6. **Multiple peers:** V04 is fixed — versions are shown only when all peers agree; otherwise unknown.
7. **Live permission/question prompts** were not observed in real traffic; they are covered by MOCK
   and reducer tests.
8. Windows named pipes remain out of scope until Phase 6.

## 10. Hardware validation performed — outcome

The procedure was executed with explicit owner authorization.

1. Full 4 MiB backup read before any write; hash recorded. The Phase 3.1 application was extracted
   from the backup and matched `280166…e12ad`.
2. Phase 4 application-only flash at `0x10000` with esptool 5.7.0 `--no-stub`; write and independent
   read-back matched `741dcb5b…`.
3. **Blocked at the USB handshake**: the Phase 4 image sent `hello`/heartbeats but never ACKed
   `ready`/`config` on multiple cold boots. The optional `state.opencodeVersion` capability was
   advertised (hello 164 B) but the link never established. No device error or resync.
4. The functional checks were nonetheless completed while the Phase 4 image was alive: EN/FR/DE
   tours, language switching/persistence, quiet override, gestures, very-long reset, auto-return,
   MOCK permission/input/retry/terminal layouts, System `2.4.1`, MCP 8/12, Tokens `SESSION TOTAL` /
   `CTX --`. These are recorded in `docs/evidence/phase-4-hardware-validation.md` and are not a
   substitute for a stable USB gate.
5. The Phase 3.1 image was reflashed, verified and handshook immediately; the bridge is LIVE.
6. The Phase 5 isolation plan is in `docs/handover-phase4.md`; do not retry Phase 4 acceptance before
   the USB RX mechanism is understood.

## 11. Local commits

```
1b43a6a fix(bridge): survive the USB boot backlog and bound the handshake
c39b1fa docs: record the Phase 4 dashboard, localization and preferences
ecc6e45 test(preview): cover languages, profiles and MCP subsets
dbe3e61 feat(bridge): expose the OpenCode version and apply auto-return
da26995 feat(firmware): localize the six dashboards and complete their metrics
```

The hardware-validation documentation commit follows these. All commits are local; nothing was
pushed, fetched or published. GitHub remains the Product Owner's responsibility.

## 12. Final state

- Device: **Phase 3.1 release `280166…e12ad` installed and verified** (rollback after the blocker).
- Bridge: **LIVE** with the Phase 4 bridge code, one OpenCode peer, MCP 8/12, real tokens,
  0 device error / 0 resync in the final window.
- Phase 4 image: `741dcb5b…` (and the experimental `848b3a99…`) preserved, **not installed**.
- Diagnostic image: removed; preserved only in `.backups/phase4-2026-11-26/`.
- Phase 4 gate: **FAIL / BLOCKER**; Phase 5 must isolate the USB RX regression.
- Phase 5 and Phase 6: not started.
- No GitHub operation, no secret, no global OpenCode configuration change.
