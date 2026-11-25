# Phase 3 handover

State at the end of Phase 3 (2026-11-25).

## What works today

- `cd bridge && npm run live` starts the LIVE bridge (serial + local IPC).
- The plugin lives in `plugin/opencode-buddy` and must be added to an OpenCode `plugins` array.
- Real prompts drive THINKING / GENERATING / WORKING / SUCCESS / IDLE on the panel.
- MOCK remains available with `npm run mock`; it never mixes with live data.

## What the next phase must not break

1. `firmware/` and the Codex Astra design: no change was made in Phase 3.
2. NDJSON v1: unchanged; no new field was added.
3. `docs/security.md` §5: the IPC has two layers (0700/0600 + per-run token). Do not "simplify" it to
   a loopback TCP port.
4. The plugin has no dependency on purpose. Adding `@opencode/plugin` reintroduces version coupling
   with no benefit.

## Open items, in order of value

1. **Trigger a real `permission.asked` and a `form.created`** with an interactive session (needs the
   product owner) and record them in the evidence file.
2. **One-hour soak** (Phase 2 carry-over) on the LIVE path, with the bridge log as evidence.
3. Two concurrent active sessions on one server (two prompts, one server) to exercise aggregation.
4. A second provider (any) to confirm the mapping is not DeepSeek-specific.

## Useful commands

```sh
cd bridge
npm run live -- --log-level debug
npm run diagnose:opencode
node ../scripts/install-buddy-plugin.mjs --check
```

`OPENCODE_BUDDY_DEBUG=1` writes plugin events to `/tmp/opencode-buddy-debug.log`.
