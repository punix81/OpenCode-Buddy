# Phase 3 baseline — repository and OpenCode v2 audit

Date: 2026-11-25
Repository: local only, branch `main`, nothing pushed.
Established **before** any Phase 3 change.

## 1. Repository state

| Item | Value |
| --- | --- |
| HEAD at baseline | `703c6c7 fix(bridge): recover from a missed handshake instead of waiting forever` |
| Working tree | clean |
| Remote operations | none performed, none attempted |
| Phases delivered | 0, 1, 2 complete; Phase 2 reports one open measurement (see §5) |

### Codex Astra redesign (preserved)

| Commit | Scope |
| --- | --- |
| `5d16230` | circular display audit and redesign plan |
| `1499c73` | redesigned dashboard and face, shared native preview, six screens |
| `d981c1e` | record of the flashed release image and USB boot |

The redesign is the current visual contract. Phase 3 must not alter `firmware/src/Dashboard.cpp`,
`BuddyFace`, `Theme`, `AnimationEngine` or the preview tooling.

## 2. What exists at baseline

| Layer | Implementation |
| --- | --- |
| Firmware | ESP32-C3, GC9A01 240×240, TTP223, NDJSON v1 parser, six screens, twelve states |
| Protocol | NDJSON v1 ratified: eleven message types, 2048-byte line limit, field ownership, ACK/resync |
| Bridge | TypeScript, strict, transports (serial/memory/socket), discovery, registry, reducer, metrics, privacy, normalizer, mock adapter, simulator |
| Tests | bridge 38/38, protocol vectors 11 valid + 13 invalid, firmware host parser suite |
| Hard data | flashed image `firmware.bin` 405,712 B, on-device `hello` fw `0.2.0` observed again this session |

## 3. OpenCode installation (verified this session)

| Item | Value | Evidence |
| --- | --- | --- |
| Binary | `/usr/bin/opencode`, `@opencode/cli@2.4.1` (npm global) | `opencode --version` → `2.4.1` |
| Runtime | Bun (CLI reports `/usr/bin/node` process identity v26.3.0, `argv[0]=bun`) | probe plugin `setup` |
| Background service | `http://127.0.0.1:49374`, `opencode service status` | command output |
| Plugin SDK | `@opencode/plugin@2.0.16`, `@opencode/client@2.0.16`, `@opencode/schema@2.0.16` | installed copy used by `@bit-ai/opencode` |
| Loaded plugin | `bit-ai 0.1.2` (`@bit-ai/opencode`) | `opencode plugin list` |
| Config root | `~/.config/opencode/opencode.json`, key `plugin` (legacy) normalised to `plugins` | `/api/config` |
| API surface | OpenAPI 3.1.0, 146 paths, 101 event schemas | `opencode api get /openapi.json` |
| Local HTTP API auth | **required** (`UnauthorizedError` without credentials) | direct `curl` to `/api/event` |

The plugin API was proven live: a probe plugin loaded in a standalone run, subscribed to
`ctx.event.subscribe()` and observed 63 real events for a single prompt. Runtime facts verified from
inside the plugin: `node:net` available, `ctx.event` exposes only `subscribe`, `ctx.app.version` `2.4.1`.

## 4. Bridge test baseline

```
cd bridge && npm run typecheck   → 0 diagnostics
cd bridge && npm test            → 38/38 pass
```

## 5. Known limitations carried into Phase 3

| Limitation | Status | Consequence for Phase 3 |
| --- | --- | --- |
| One-hour soak (Phase 2) | **OPEN** — never completed | Phase 3 stability claims are bounded; the soak stays an explicit requirement |
| Heap/FPS on device | **OPEN** — needs a diagnostic build | Not measured by Phase 3; do not claim |
| Screen 6 "OpenCode version" | Protocol v1 has no field | Must stay undocumented on device or be reported as unavailable |
| Context occupancy (CTX) | No verified capacity source in v2 events | Must remain `CTX --` unless a verified field exists |

## 6. Risks specific to Phase 3

1. The v2 event stream is **in-process only**; the HTTP API needs credentials. The plugin is therefore
   the only supported integration point.
2. `session.usage.updated` semantics (cumulative vs incremental) is documented as a snapshot by shape,
   but must be confirmed against two consecutive real events before trusting the Tokens screen.
3. Tool names arrive on `session.tool.input.started`, not on `session.tool.called`; a bounded id→name
   cache is required or the Tools screen degrades to `other`.
4. The v2 plugin API is young (2.0.16). Everything used here must be pinned and re-verified on upgrade.
