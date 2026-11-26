# Phase 4 plan — developer dashboard

Date: 2026-11-26
Baseline: local `8bf3e08`, firmware release `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad`.
Tests at baseline: bridge 87/87, plugin 24/24, protocol PASS, firmware host PASS.

## 1. Audit — what already exists

| Area | State | Notes |
| --- | --- | --- |
| Buddy screen | Complete | Expression, state, model, agent, source footer, page indicator; permission priority via state |
| Session screen | Complete | Model/agent, elapsed execution time, state, active sessions; latest-active focus in the bridge |
| Tokens screen | Complete for input/output/total | `TOTAL` label is ambiguous with context; CTX intentionally `--` |
| Tools screen | Complete | Per-focus-session counters and six categories |
| MCP radar | Complete | 8 details, true totals, aliases, status classes |
| System screen | Mostly complete | USB, bridge, OpenCode availability, firmware, bridge version, protocol, diagnostic; **OpenCode version missing** |
| Localization | Missing | All labels hard-coded in English; language preference exists (0/1/2) but no translated strings and no accented glyphs |
| Preferences | Partially complete | Language/quiet/screen in NVS; language not applied to labels; auto-return/MCP names host-side; no settings UI |
| Preview | Complete for English mock profiles | Six screens, twelve states, missing/extreme/degraded; no language or 12-server MCP scenario |

## 2. Metric matrix

Legend: **S** supported and reliable, **P** partial, **M** missing, **U** unreliable / not verifiable.

| Metric | Source | State |
| --- | --- | --- |
| Execution state | `execution.*`, `phase`, `session.idle` | S |
| Pending permissions/questions | IDs + derived priority | S |
| Retry attempt | `session.retry.scheduled` | S |
| Model / agent | `session.step.started`, selection | S |
| Active sessions | reducer | S |
| Execution duration | bridge monotonic clock | S — never the session lifetime |
| Input/output tokens | `session.usage.updated`, cumulative, max per session | S — verified against the API |
| Session total | input + output when both known | S — label will say SESSION TOTAL |
| Reasoning tokens | `session.usage.updated` | P — received by the plugin/bridge, **not in the NDJSON state**; not added to total |
| Cache read/write | same | P — received, not in the state; overlapping components of input; never added |
| Context occupancy | — | M — no verified occupancy |
| Context capacity | `Model.Info.limit.context` | M — not exposed per session by a verified event |
| Context percentage | — | **M — CTX stays `--`; no percentage is invented** |
| Tool counters and categories | `session.tool.*`, `input.started.name` | S — category from verified tool names; no authoritative category field exists |
| MCP totals | `ctx.mcp.list()` complete list | S — details capped at 8 |
| MCP statuses | `Mcp.Server.status` | S — six classes |
| USB / bridge / OpenCode availability | firmware links, `source` | S |
| Firmware/bridge/protocol versions | state `versions` | S |
| OpenCode version | plugin hello `appVersion` | M in the state — add an **optional** field behind a capability |
| Data source | state `source` | S — MOCK is labelled; LIVE will be explicit |

## 3. Decisions

1. **Session totals are not context.** The Tokens page will say `SESSION TOTAL`; CTX stays `--` until a
   verified occupancy and capacity exist. Reasoning and cache remain visible in the plugin/bridge
   diagnostics but are not displayed and never added to the total (they overlap the input/output
   counters in the provider usage model).
2. **Localization is centralized** in `firmware/src/Localization.*` with English, French and German
   tables. Every label on the six screens, the state vocabulary, the toasts, the system values and the
   MCP/tool categories goes through it. The product name OpenCode Buddy is never translated.
3. **Accented glyphs** are composed over the existing FreeSans/Font2 fonts (base glyph + a small
   primitive accent mark), because those fonts only cover ASCII 0x20–0x7E. This preserves the Codex
   Astra typography; no new font family is introduced. Borrowed punctuation was rejected after the
   first pixel review: its own top-of-cell offset floated far above the letter.
4. **OpenCode version** is added to the state `versions` object as an optional field, only sent when the
   device advertises `state.opencodeVersion`. The current Phase 3.1 firmware does not, so the running
   device stays compatible.
5. **MCP details stay out of the state burst** (commit `e800aae`): totals are separate, details are
   capped at eight, and the radar shows the subset ratio when `total > count`.
6. **Preferences workflow**: the device owns language and quiet mode. The host can override them
   explicitly in `config.local.json` (`language`, `quietMode`); the bridge omits them otherwise. A
   language override applies without reboot and is stored in NVS. No gesture is reassigned. A settings
   screen is not added in Phase 4; the proposed workflow is the local configuration file plus the
   existing gestures. Auto-return and MCP name display remain host-side options and are documented, not
   moved into new gestures.
7. **No protocol-breaking change**: all additions are optional and capability-gated; the existing
   schema/vectors remain valid.

## 4. Implementation scope

- `Localization.h/.cpp`, accent composition in `Theme::text`, language propagated through
  `StateManager`; Dashboard, ScreenManager toasts and preview use it.
- Tokens label `SESSION TOTAL`, localized IN/OUT, compact k/M/B values (already numeric).
- System screen: seventh row for the OpenCode version, gated by the new capability.
- MCP radar: localized status vocabulary and a `count/total` subset caption.
- Preview: language selector and French/German sheets; 12-server total / 8-detail scenario; 240×240
  verification; no second simulator.
- Tests: localization completeness, accent decode, state/metric consistency, MCP 12/8, optional
  version compatibility, preview pixel/language checks; host tests.
- Documentation: the required Phase 4 files, roadmap, README, AGENTS, CHANGELOG.

Out of scope: context percentage, reasoning/cache display, new gestures, graphical settings app,
hardware flash (approval gate), Phase 5 soak/performance optimization, Phase 6 packaging.

## 5. As built (2026-11-26)

| Planned item | Result |
| --- | --- |
| Central localization | `Localization.{h,cpp}`; three complete tables; all screens, toasts, tools, MCP, system values |
| Accents | Primitive composition over measured cap/x-height; UTF-8 safe truncation; ASCII fast path kept |
| Tokens label | `SESSION TOTAL` localized; `CTX --` retained; 64-bit total derived when the uint32 field is omitted |
| System | Seven rows including optional OpenCode version behind `state.opencodeVersion` |
| MCP radar | Localized statuses, `n/total shown` subset caption, 12-server/8-detail fixture and test |
| Preferences | Existing gestures unchanged; language override without reboot; `autoReturnSeconds` now applied by the firmware; config workflow documented |
| Preview | Language selector, seven profiles, native sheets for EN/FR/DE and the 12-server subset |
| Tests | Bridge 94/94, plugin 24/24, protocol 12 valid/14 invalid, firmware host 4 suites, preview 8/8 |
| Build | Release SUCCESS, 22 604 B RAM / 376 336 B flash (incremental); clean build recorded in the Phase 4 report |
| Not done | Hardware flash (awaiting approval), Phase 5 soak, Phase 6 packaging |

The only protocol addition is the optional `versions.opencode` field plus its capability. It is
ignored by an older firmware and omitted by the bridge unless the device advertises the capability.
No existing field, message or sequence rule changed.
