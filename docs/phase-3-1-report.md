# Phase 3.1 — audit remediation report

Date: 2026-11-26
Audited baseline: `e7a8cb71da0a049f7d09caa8eb5f95fa6af11943` (identical to HEAD at the start)
Verdict: **code complete and tested; firmware flash and hardware validation pending explicit approval.**
Companion documents: `docs/audit-phase-3-1.md` (finding-by-finding dispositions),
`docs/evidence/phase-3-1-test-summary.md` (commands and outputs).

## 1. Summary

All fourteen findings were investigated. Every P1 defect that the source code confirmed is corrected
with a regression test. Two claims were narrowed by evidence:

- the Node `serialport` write path does **not** expose partial writes, so that part of F08 is a false
  positive; the firmware side of F08 was real and is fixed with a bounded TX staging buffer;
- the firmware currently flashed predates the optional `config` fields, so the bridge keeps sending
  the legacy fields to it and keeps the device usable. The new behaviour activates after an approved
  flash (hello capability `config.partial`).

The visual design, the wiring, the panel configuration and NDJSON v1 are unchanged. The visual assets
were not touched.

## 2. Baseline and scope

| Check | Before changes |
| --- | --- |
| HEAD vs audited commit | identical |
| Bridge typecheck | PASS |
| Bridge tests | 56/56 |
| Plugin tests | 13/13 |
| Protocol validation | PASS (11 valid, 13 invalid) |
| Firmware host tests | PASS (protocol, gestures) |
| Firmware build | 371 804 B flash, 20 516 B RAM |

No flash was performed; the ESP32-C3 kept its existing image for the whole phase.

## 3. What changed

| Area | Change |
| --- | --- |
| Interaction state | Pending permissions/questions are a derived priority; request identifiers are deduplicated and synchronized from `ctx.permission.list()` |
| Metrics | Tokens and tools are per session, unknown counters stay `null`, tool calls have a real lifecycle, focus is the most recently active session |
| Live ownership | Sessions belong to one peer; disconnect, stale timeout and degraded source close only that peer; terminal notifications survive their TTL |
| IPC | PID lock before touching shared files, 0700 real directory, no symlink, no non-socket unlink, UTF-8 byte limits, `source` health message |
| Plugin | Supervised subscription with bounded resubscription, ordered snapshots, bounded queue/buffer, request IDs, MCP replacement with true totals, private sanitized diagnostics, explicit ownership policy |
| Transport | USB discovery is re-run on reconnect; ACKs are cleared per session and expire explicitly |
| Firmware | Bounded TX staging buffer with partial-write retry; optional `config` fields behind a hello capability; NVS writes only on change |
| Protocol | `config.language`/`quietMode` optional, `caps` optional in `hello`; both additive and documented |

## 4. Commands and results (final)

```
cd bridge
npm run typecheck            PASS (0 diagnostics)
npm test                     81/81
npm run test:plugin          24/24
npm run validate:protocol    PASS (11 valid, 13 invalid, examples verified)

bash firmware/test/host/run.sh
  firmware protocol tests: PASS
  firmware gestures with mock GPIO: PASS
  firmware tx buffer tests: PASS

cd bridge && npm run simulate -- --scenario all-states --duration 3000   PASS
.venv/bin/pio run -d firmware -e supermini                               SUCCESS
```

Live OpenCode 2.4.1 integration (new bridge, new plugin, existing firmware):

```
INFO  opencode peer=1 app=cli version=2.4.1 plugin=opencode-buddy version=0.1.0
DEBUG opencode peer=1 source=ok
DEBUG event kind=permission.sync
INFO  state status=thinking sessions=1 elapsed=990s tokens=51138629/82663 tools=0/0/0 source=live
INFO  mcp online=8 total=12 source=live
```

At startup, before any peer: `state status=offline sessions=0 elapsed=0s tokens=--/--`. The main
companion state now reflects OpenCode being unavailable even though USB is ready.

## 5. Firmware changes

| File | Reason |
| --- | --- |
| `firmware/src/TxBuffer.h` (new) | Bounded 2048-byte staging buffer; a Serial partial write retries the remainder next loop and a truncated NDJSON line is impossible |
| `firmware/src/main.cpp` | FrameWriter now targets the TX buffer; `flushTx()` once per loop, bounded by `Serial.availableForWrite()`; no blocking, watchdog fix untouched |
| `firmware/src/ProtocolParser.h/.cpp` | `config.language`/`quietMode` optional with `languageSet`/`quietSet`; hello advertises `caps:["config.partial"]` |
| `firmware/src/PreferencesManager.cpp` | NVS writes only when a preference actually changes |
| `firmware/test/host/test_tx.cpp` (new) | Partial sink, lying sink, full buffer, zero-space sink |
| `firmware/test/host/test_protocol.cpp` | Config without preferences keeps device ownership |
| `firmware/test/host/run.sh` | Builds and runs the TX test |

Build result (compile only, no upload):

```
RAM:   22 572 B / 327 680 B (6.9 %)   (+2 056 B vs baseline)
Flash: 372 182 B / 1 310 720 B (28.4 %) (+378 B vs baseline)
firmware.bin: 406 128 bytes
sha256: 280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad
```

**Flash is not approved by this report.** Current device image is unchanged and keeps working: the
bridge detects the missing `config.partial` capability and sends the legacy config fields.

### Proposed hardware validation after approval

1. Keep the current image restorable (`firmware.bin` of the current build is in `.pio/build`; the
   Product Owner owns the previous full dump).
2. `pio run -d firmware -e supermini -t upload --upload-port /dev/ttyACM0` only after explicit
   approval; no other process may hold the port.
3. Verify boot, USB enumeration and the OFFLINE screen; then `npm run diagnose -- --duration 15000`.
4. Send a prompt: THINKING → GENERATING → WORKING → SUCCESS on screen, chronometer counting, tokens
   and tools updating, MCP radar 8/12.
5. Long press: quiet mode ON, unplug/replug USB, confirm quiet mode is still ON (the F10 fix).
6. Run the outstanding one-hour soak and the heap/FPS measurement with the diagnostic build.

## 6. Security

- IPC: PID lock, 0700 real directory owned by the user, no symlink, non-socket paths never unlinked,
  0600 token, 256-bit token, UTF-8 byte bounds, rate limit, 8 peers.
- Plugin diagnostics: private runtime directory, 0600 file, 1 MiB cap, sanitized messages; debug is
  opt-in.
- Ownership: located events must match the plugin directory; location-less events require a known
  session; `session.created` without a location is rejected; only `mcp.status.changed` is a global
  allowlist entry.
- No permission approval, no prompt, no tool execution and no file write was added to the plugin.
- Documentation contains no home directory, proxy detail or board identifier; MAC addresses remain
  local.

## 7. Limitations and remaining work

1. Firmware not flashed: F08/F10/F12 hardware behaviour and the new TX path are compile- and
   host-test-verified only.
2. Event-source resubscription and the concurrent snapshot race were exercised at unit/IPC level, not
   by killing a live OpenCode subscription.
3. Permission and form **live** prompts remain unobserved; identifiers come from the verified OpenAPI
   schema.
4. One-hour soak and heap/FPS measurements remain open (Phase 2 carry-over).
5. One provider (DeepSeek) verified end to end.
6. Windows named pipes remain unimplemented; Linux/macOS only.

## 8. Local commits

```
2d22033 fix(firmware,bridge): stage serial frames, keep device preferences and recover the link
8b1c895 fix(plugin): supervise the event stream and bound what leaves the server
828d5d9 fix(ipc): enforce a single bridge and own sessions per OpenCode peer
3ad8d48 fix(state): separate interactions from activity and scope metrics to one session
```

Documentation for Phase 3.1 is committed separately. Nothing was pushed; remote publication remains
the Product Owner's responsibility.

## 9. Recommendation

Accept the Phase 3.1 **code** baseline. Schedule the approved flash and the hardware validation
procedure above, then close the remaining soak/heap measurements. Do not start later phases before
that hardware pass.
