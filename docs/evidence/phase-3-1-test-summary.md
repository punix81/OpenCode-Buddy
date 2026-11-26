# Phase 3.1 — test summary

Date: 2026-11-26
Baseline: `e7a8cb71da0a049f7d09caa8eb5f95fa6af11943`. Firmware on the device was not replaced.

## 1. Automated suites

| Suite | Result |
| --- | --- |
| `npm run typecheck` (bridge, strict) | PASS, 0 diagnostics |
| `npm test` (bridge) | **85/85** |
| `npm run test:plugin` (plugin) | **24/24** |
| `npm run validate:protocol` | PASS (11 valid, 13 invalid, examples verified) |
| `bash firmware/test/host/run.sh` | protocol PASS, gestures PASS, **TX buffer PASS** |
| `npm run simulate -- --scenario all-states --duration 3000` | PASS (state and device snapshots received) |
| `.venv/bin/pio run -d firmware -e supermini` | SUCCESS |

New tests, by finding:

| Finding | Tests |
| --- | --- |
| F01 | pending permission survives phase/tool events; duplicate request ID ignored; sync replaces the set |
| F02 | one peer disconnect closes only its sessions; terminal notification survives the peer |
| F03 | tokens are the focus session's; unknown counter stays null |
| F04 | missing start counts; duplicate outcome does not decrement running; per-session tools |
| F05 | degraded source closes sessions and reports offline (IPC-level) |
| F06 | UTF-8 line limit; frame byte limit; reordered terminal events ignored; transport factory called on link loss |
| F07 | second bridge refused; stale lock recovered; non-socket path preserved |
| F08 | TX partial/lying/full/zero-space sinks; ACK expiry |
| F09 | MCP replacement removes vanished servers; declared totals survive details; offline clears MCP |
| F10 | legacy firmware receives fields; `config.partial` omits them; explicit override wins |
| F11 | most recently active session wins |
| F12 | (firmware compile and code review; Preferences has no host mock) |
| F13 | UTF-8 byte limits; sanitizer removes paths/IDs/newlines |
| F14 | seven ownership cases |
| Extra | inactive session pruned after TTL; offline with USB; terminal notification; memory bounds |

## 2. Firmware build

```
RAM:   22 572 / 327 680 B (6.9 %)   baseline 20 516 B
Flash: 372 182 / 1 310 720 B (28.4 %)   baseline 371 804 B
firmware.bin: 406 128 bytes
sha256: 280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad
```

Compile only. **No upload, no flash, no device reboot was requested by this phase.**

## 3. Live OpenCode 2.4.1 evidence

Existing firmware, new bridge and new plugin, one real session:

```
INFO  opencode peer=1 app=cli version=2.4.1 plugin=opencode-buddy version=0.1.0
DEBUG opencode peer=1 source=ok
DEBUG event kind=permission.sync
INFO  state status=thinking sessions=1 elapsed=990s tokens=51138629/82663 tools=0/0/0 source=live
INFO  mcp online=8 total=12 source=live
```

Before any peer connected:

```
INFO state status=offline sessions=0 elapsed=0s tokens=--/-- tools=0/0/0 source=live
INFO mcp online=0 total=0 source=live
```

These lines are observed runtime data, not synthetic events. The permission sync carried no pending
request (none was open); deduplication is covered by synthetic tests only.

## 4. What was not exercised

- Resubscription after a real `ctx.event.subscribe()` failure (unit/IPC paths only).
- The snapshot/concurrent-event race under real load.
- Live `permission.asked` / `form.created` prompts.
- One-hour soak and heap/FPS measurements.
- A second provider.
- The new firmware on hardware (flash not approved).


## 5. Hardware validation summary

| Check | Result |
| --- | --- |
| Flash + independent verify | PASS (release `280166…e12ad`, read back and matched) |
| Caps negotiation / partial config | PASS (`caps=config.partial`, 176 B config) |
| Bridge restart with device running | 0 error, 0 resync |
| 61-min soak | PASS: 3 647 states, 7 295 ACK, avg 65 ms, 0 resync, 0 steady-state error, RSS 56 404 kB constant |
| Heap / max block (diagnostic) | 245 812 B / 225 268 B, constant over 4.5 min |
| FPS / render | avg 18, max 21; render avg 47.2 ms, max 48.1 ms |
| QUIET persistence | bridge restart, MCU restart, USB replug: PASS (Product Owner) |
| USB reconnect | PASS; 4 backoff attempts, hello/caps/ready; one transient E_PARSE+resync while the device booted, recovered in ~2 s |
| Very long reset | PASS (`interaction gesture=very_long`, RESET, QUIET off) |
| Long press / short press | `gesture=long` and `gesture=short` logged on the release |
| Final state | release firmware installed, bridge LIVE |
