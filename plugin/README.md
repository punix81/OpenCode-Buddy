# Plugin (OpenCode v2)

Status: **not implemented** — Phase 3.

## Planned layout

```text
plugin/
├── package.json               "type": "module", exports "." (server part)
├── src/
│   ├── index.ts               Plugin.define, setup, cleanup
│   ├── OpenCodeAdapter.ts     ctx.event.subscribe + snapshot seeding
│   ├── EventClassifier.ts     tool-id → category, phase mapping
│   ├── PrivacyGate.ts         allowlist projection, drop raw payloads
│   └── BridgeLink.ts          loopback client, bounded queue, backoff
└── test/
```

## Contract

- Runs inside the OpenCode server; no HTTP authentication, no polling.
- Uses `ctx.event.subscribe({ types, signal })`, `ctx.session.list/get`, `ctx.permission.list`,
  `ctx.mcp.list`, `ctx.app.version`, `ctx.storage` (optional cache).
- Never calls `permission.reply`, `session.prompt`, `session.command`, `session.interrupt` or any
  transform that changes agent behaviour.
- Never throws into the host: all handlers are guarded; failures are counted and logged sanitized.
- Target: `@opencode/plugin` 2.4.x. A version mismatch surfaces as an explicit "plugin incompatible"
  state rather than silent degradation.

Development loads the plugin from a project-local `.opencode/plugins/` directory, so no existing
global configuration is modified. Packaging and installation belong to Phase 6.
