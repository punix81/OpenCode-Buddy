# Phase 3 report — real OpenCode v2 integration

Date: 2026-11-25
Repository: local only, branch `main`, no remote operation performed.
Scope: P3-01 … P3-13. Firmware, protocol v1 and the Codex Astra design are untouched.

## 1. Executive summary

Normal operation now uses real OpenCode 2.4.1 data. A dependency-free server plugin subscribes to the
public v2 event stream, filters events to its own OpenCode location, projects an allowlist of fields and
forwards them over a Unix socket in a `0700` directory with a per-run token. The bridge validates
everything again, feeds the existing registry/reducer/metrics/privacy chain and drives the unchanged
firmware over NDJSON v1.

Verified on hardware with real executions: THINKING → GENERATING → SUCCESS, WORKING for a real `ls`,
real model, agent, token counts and tool counters, and an automatic return to IDLE/OFFLINE when the
plugin disappears. MOCK is now an explicit development mode only; there is no fallback.

Two defects were found only by real data and fixed: the plugin restored **another project's 31.9 M
input-token total** at connect, and MCP status was rejected because `Mcp.Server.status` is an object,
not a string. Permission and form notifications are implemented and unit-tested but were **not**
triggered live (no safe non-interactive path).

## 2. Verified OpenCode version

`opencode 2.4.1` (`@opencode/cli`), plugin API `@opencode/plugin@2.0.16`, client/schema `2.0.16`,
runtime Bun inside the server process. OpenAPI 3.1.0 with 146 paths and 101 event schemas.

## 3. Architecture

```
OpenCode 2.4.1 → plugin (event.subscribe, location filter, allowlist)
              → Unix socket 0700 + 0600 token → bridge (validate, registry, privacy)
              → NDJSON v1 over USB CDC → ESP32-C3 (unchanged)
```

Chosen over the HTTP API because `/api/event` requires credentials and the plugin API is in-process.
Justification and alternatives: `docs/opencode-integration.md`, `docs/phase-3-plan.md`.

## 4. Implemented plugin

`plugin/opencode-buddy/`: `index.js` (transport, snapshot, reconnect, debug), `map.js` (pure
projection), `index.d.ts` / `map.d.ts`, `map.test.mjs`. No dependency, no build step.

## 5. Event mapping

Full table in `docs/opencode-v2-event-mapping.md`. Sources used: `session.execution.*`,
`session.step.*`, `session.text.started`, `session.reasoning.started`, `session.tool.*`,
`session.usage.updated`, `permission.*`, `form.*`, `mcp.status.changed`, `session.created/deleted`,
`session.compaction.*`.

## 6. Supported states

| State | Real source | Level |
| --- | --- | --- |
| OFFLINE | no plugin peer / 15 s silence | VERIFIED |
| IDLE | no active session | VERIFIED |
| THINKING | `session.step.started`, `session.reasoning.started` | VERIFIED (approximation documented) |
| GENERATING | `session.step.first-token`, `session.text.started` | VERIFIED |
| WORKING | `session.tool.called` … `success/failed` | VERIFIED |
| PERMISSION_REQUIRED | `permission.asked` | payload VERIFIED, live NOT VERIFIED |
| USER_INPUT_REQUIRED | `form.created` | payload VERIFIED, live NOT VERIFIED |
| SUCCESS | `session.execution.succeeded` | VERIFIED |
| ERROR | `session.execution.failed` | schema VERIFIED, live NOT VERIFIED |
| COMPACTING | `session.compaction.started/ended` | schema VERIFIED, live NOT VERIFIED |
| RETRYING | `session.status(retry)` / `session.retry.scheduled` | schema VERIFIED, live NOT VERIFIED |
| INTERRUPTED | `session.execution.interrupted` | schema VERIFIED, live NOT VERIFIED |

## 7. Real data per screen

| Screen | Real values observed |
| --- | --- |
| 1 Buddy | state, model `deepseek-v4-1-flash-1017-r`, agent `build`, link, source=live |
| 2 Session | model, agent, execution duration, active sessions |
| 3 Tokens | input/output/total from cumulative `usage.updated`; reasoning and cache carried; CTX `--` |
| 4 Tools | running/success/failed and categories, e.g. `tools=3/0/1` during `ls` |
| 5 MCP Radar | `online=7 total=12` on a real prompt: 12 configured servers, 8 dots (connected first) |
| 6 System | USB, bridge, OpenCode, firmware, bridge version, protocol — OpenCode version unavailable |

## 8. Unsupported metrics

Context occupancy (CTX), OpenCode version on screen 6, per-model quota, cost on screen (available in
events but not in the protocol), and MCP tool names on screen (not forwarded).

## 9. Automated tests

Typecheck PASS, bridge 45/45, protocol vectors PASS, plugin 9/9, firmware host PASS. See
`docs/evidence/phase-3-test-summary.md`.

## 10. Real OpenCode tests

Eight real prompts/commands were executed. Details and timestamps in
`docs/evidence/phase-3-live-validation.md` §1–§3.

## 11. Physical ESP32 validation

Link verified: handshake, `state` 1/s, ACKs at ~29 ms, no reset, no watchdog. States were emitted to
the device for each real transition. **Visual confirmation on the panel is the product owner's
observation** — no photograph or measurement is claimed here.

## 12. Security findings

See `docs/evidence/phase-3-security-validation.md`. One high-severity defect found and fixed
(cross-project snapshot), one medium (MCP names), two accepted low risks.

## 13. Performance

Not measured against a baseline in this phase: no soak, no CPU/heap profiling. Observed cost per
event is one JSON projection and one socket write; the bridge sends `state` once per second. The
Phase 2 one-hour soak remains **OPEN**.

## 14. Installation

`node scripts/install-buddy-plugin.mjs` prints the exact change; `--project DIR` writes a project
config with a backup; the global configuration is never rewritten. Full procedure:
`docs/plugin-installation.md`.

## 15. Daily commands

```sh
cd bridge
npm run live                 # LIVE (default)
npm run mock -- --scenario all-states
npm run diagnose
npm run diagnose:opencode
npm run typecheck
npm test
```

## 16. Local commits

See `git log --oneline` after this report; the phase is delivered in focused commits
(`feat(plugin)`, `feat(bridge)`, `docs`, `fix(firmware-test)`).

## 17. Remaining limitations

1. `permission.asked` and `form.created` not observed live.
2. Two simultaneous *active* executions not observed (standalone runs serialize); multi-session is
   covered by reducer tests and multiple peers were verified.
3. One-hour soak and heap/FPS measurements still open from Phase 2.
4. Windows IPC not implemented; Linux/macOS only.
5. Context occupancy unavailable; `CTX --` remains.
6. No second provider tested (DeepSeek only).

## 18. Verdict

**PASS WITH RESERVATIONS** — the integration is real, secured and tested; three live behaviours
(permission, form, MCP radar) and the soak remain to be confirmed.
