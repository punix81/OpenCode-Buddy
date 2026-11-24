# Bridge (TypeScript / Node.js)

Status: **not implemented** — Phase 2.

## Planned layout

```text
bridge/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               entry, wiring, shutdown
│   ├── config/ConfigurationManager.ts
│   ├── adapters/OpenCodeAdapter.ts   (plugin link)
│   ├── adapters/MockAdapter.ts       clearly labelled mock
│   ├── normalize/EventNormalizer.ts
│   ├── state/SessionRegistry.ts
│   ├── state/StateReducer.ts
│   ├── metrics/MetricsManager.ts
│   ├── transport/SerialTransport.ts
│   ├── transport/DeviceDiscovery.ts
│   ├── privacy/PrivacyFilter.ts
│   └── diagnostics/DiagnosticLogger.ts
└── test/
```

## Behavioural contract

- Loopback listener only (`127.0.0.1`), per-run token for state changes.
- Plugin events are validated, normalized, deduplicated, aggregated, then projected onto the protocol
  allowlist.
- Device absence, plugin absence and OpenCode absence are all normal, non-fatal conditions.
- Full snapshot after every handshake; heartbeat every 2 s; link down after 6 s.
- Mock mode must announce itself in logs and on the System screen (`MOCK`).

Dependencies are not chosen yet; `serialport` is the leading candidate pending a licence and native
build review (see `docs/security.md` §8).
