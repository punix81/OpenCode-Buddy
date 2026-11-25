# Phase 3 plan — real OpenCode v2 integration

Date: 2026-11-25
Status: implementation plan, written after the P3-01 audit and the P3-02 API verification.

## 1. Goal

Replace simulated data in normal operation with real OpenCode v2 events, without touching the
firmware, the ratified NDJSON v1 protocol or the Codex Astra visual design.

## 2. Verified integration point

OpenCode v2 loads **server plugins** in-process (`@opencode/plugin@2.0.16`) and exposes
`ctx.event.subscribe()` over the public event stream. The local HTTP API requires credentials, and
`/api/event` is not reachable without them. The plugin is therefore the supported adapter.

```
OpenCode v2 server
  └─ opencode-buddy plugin      (in-process, event.subscribe, allowlist projection)
       └─ Unix socket + token   ($XDG_RUNTIME_DIR/opencode-buddy)
            └─ TypeScript bridge (validation, registry, privacy, NDJSON v1, USB)
                 └─ ESP32-C3 firmware (unchanged)
```

No firmware change is required: every value Phase 3 needs already exists in `StateData`.

## 3. Work packages

| ID | Work | Output |
| --- | --- | --- |
| P3-02 | Event mapping | `docs/opencode-v2-event-mapping.md` |
| P3-03 | Plugin | `plugin/opencode-buddy/` (ESM, no runtime dependency) |
| P3-04 | Secure local IPC | `bridge/src/ipc/` — 0700 dir, 0600 socket, per-run token, bounded lines, rate limit |
| P3-05 | Normalisation | `bridge/src/live/normalizer.ts` extending the existing normalizer |
| P3-06 | Six screens | real model/agent/usage/tools/MCP; unknown stays unknown |
| P3-07 | Multi-session | existing registry + snapshot restore + stale invalidation |
| P3-08 | Modes | `live` default, `mock` explicit, no fallback, separate processes |
| P3-09 | Installation | `docs/plugin-installation.md`, non-destructive installer script |
| P3-10 | Compatibility | protocol v1 untouched; firmware untouched |
| P3-11 | Security | allowlist twice, token auth, no prompt/content/args ever forwarded |
| P3-12 | Tests | IPC, normalisation, plugin projection, modes, privacy |
| P3-13 | Live validation | real prompt + real tool activity + device observation |

## 4. Decisions

1. **No protocol change.** Screen 6 keeps six fields; the OpenCode version is not shown because v1 has
   no field for it. Recorded as a limitation, not worked around.
2. **Plugin has no build step and no dependency**: plain ESM `index.js` exporting
   `{ id, setup }`. `Plugin.define` is an identity function (verified in `@opencode/plugin@2.0.16`), so
   omitting the import removes an entire class of version-coupling failures.
3. **IPC token.** The design note prefers `SO_PEERCRED`; Node/Bun core exposes no portable peer-credential
   API, so the socket lives in a `0700` directory with `0600` permissions **and** requires a 256-bit
   per-run token delivered in the first frame. Documented as a deviation with its limitation.
4. **Two-stage allowlist.** The plugin projects a fixed set of fields per event; the bridge validates
   again with the existing default-deny normalizer. Nothing else can cross.
5. **Cumulative usage only.** `session.usage.updated` is treated as a cumulative session snapshot and
   combined with `max()` (existing `MetricsManager`). `session.usage.recorded` is not added, to avoid
   double counting auxiliary requests.
6. **LIVE and MOCK are separate processes.** There is no runtime switch and no fallback; the state
   `source` field already exists in the protocol.

## 5. Exit criteria

- Live prompt produces real states on the panel without a mock.
- Mock remains reachable only through the mock CLI.
- All previous tests pass, plus new IPC/normalisation/security tests.
- No GitHub operation, no firmware flash without approval.
