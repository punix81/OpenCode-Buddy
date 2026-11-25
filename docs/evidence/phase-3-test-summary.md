# Phase 3 — test summary

Commands were run in this session; results are copied from the terminal output.

| Suite | Command | Result |
| --- | --- | --- |
| Bridge typecheck | `cd bridge && npm run typecheck` | **PASS** (0 diagnostics) |
| Bridge tests | `cd bridge && npm test` | **45/45 PASS** (38 before Phase 3) |
| Protocol schema + vectors | `cd bridge && npm run validate:protocol` | **PASS** (11 valid, 13 invalid, examples verified) |
| Plugin projection tests | `cd plugin/opencode-buddy && node --test map.test.mjs` | **9/9 PASS** |
| Firmware host parser + gestures | `cd firmware && bash test/host/run.sh` | **PASS** (after the harness default was fixed) |
| Plugin load in OpenCode 2.4.1 | real `opencode --standalone run` | **PASS** (`loading plugin id=…/plugin/opencode-buddy`) |
| IPC handshake | `npm run diagnose:opencode` | **PASS** (`IPC handshake accepted`) |
| Live prompt | `opencode --standalone run "Explain …"` | **PASS** (THINKING → GENERATING → SUCCESS) |
| Live tool | `opencode --standalone run "Run the shell command: ls"` | **PASS** (WORKING with `tools=3/0/1`) |

## New bridge tests (7)

| Test | What it proves |
| --- | --- |
| `ipc socket and token are private to the user` | directory 0700, socket 0600, token 0600, 64 hex chars |
| `a connection without the token is rejected before any payload is read` | default-deny, constant-time comparison path |
| `an event before hello closes the connection` | no unauthenticated payload is parsed |
| `several authenticated peers coexist and are tracked independently` | one peer per OpenCode location |
| `parseIpcLine is default-deny` | malformed JSON, wrong version, missing token, unknown type |
| `mcp names are anonymised before they can reach the device` | `context7` never appears in the outbound event |
| `live source aliases mcp names and closes sessions when the plugin leaves` | stale sessions and pending counters disappear |

## New plugin tests (9)

Execution lifecycle, tool name → category, permission/form session ownership, cumulative usage with
cache split, model/agent propagation, **no prompt/response/argument/path leakage**, MCP aggregation and
bound, reconnect snapshot without a terminal state.

## Not run

| Suite | Reason |
| --- | --- |
| One-hour soak | Phase 2 carry-over; not re-run in Phase 3 |
| Heap/FPS diagnostic build | requires a diagnostic firmware build and a flash approval |
| Windows named-pipe IPC | not implemented; documented limitation |
| `permission.asked` / `form.created` live | no safe, non-interactive trigger |
