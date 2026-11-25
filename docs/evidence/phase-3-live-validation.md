# Phase 3 — live validation evidence

Environment: OpenCode 2.4.1 (Bun), bridge on Node 24, ESP32-C3 `44:BD:8D:4E:27:A4` on `/dev/ttyACM0`,
test project `/tmp/opencode/live-test` (git repository, plugin configured by absolute directory path).

All observations below come from the bridge log of the session, not from a reconstruction.

## 1. Real prompt (no tools)

Command: `opencode --standalone run "Explain the difference between an interface and a type alias in
TypeScript in three sentences."`

Model actually used: `deepseek-v4-1-flash-1017-r` (from the user's global configuration).

| Time | Observed state on the bridge |
| --- | --- |
| 22:20:04.038 | `opencode peer=1 app=cli version=2.4.1 plugin=opencode-buddy version=0.1.0` |
| 22:20:38.948 | `status=thinking sessions=1` |
| 22:20:40.651 | `status=generating sessions=1 tokens=36323/313` |
| 22:20:41.154 | `status=success sessions=0 tokens=47488/438` |

Ground truth from `opencode session export`: `input 11879, output 127, reasoning 88, cache 0/0`,
`outcome succeeded`. The per-step delta seen by the bridge (714 input / 8 output at that instant) is a
partial cumulative value; the totals converge after the final `session.usage.updated`.

## 2. Real tool activity

Command: `opencode --standalone run "Run the shell command: ls"`

| Time | Observed state |
| --- | --- |
| 22:21:28.066 | `status=thinking sessions=1 tokens=105227/715 tools=3/0/0` |
| 22:21:29.070 | `status=working sessions=1 tokens=105931/720` **`tools=3/0/1`** (one tool running) |
| 22:21:29.170 | `status=thinking` `tools=4/0/0` (tool succeeded) |
| 22:21:29.370 | `status=generating` |
| 22:21:29.471 | `status=success sessions=0` |

A 6 ms tool (`read`) was counted but never sampled as WORKING, which is expected at a 1 s state
interval and is documented.

## 3. Reconnect and disconnect

| Action | Observed |
| --- | --- |
| `run` ends (plugin disconnects) | `opencode peer=N disconnected, peers=0`, sessions closed, `status=idle sessions=0` |
| Bridge restart | new socket and token; the next plugin instance connected (`peer=1` of the new run) |
| Several peers | up to two peers coexisted (`peer=6` 22:21:35.283 → `peer=7` 22:21:37.356), both accepted |

## 4. Defects found by real data (fixed)

1. Snapshot contamination: `ctx.session.list()` returned other projects of the same server; the device
   received **31,939,182 input tokens** at connect for a session worth 11,879. Fixed by filtering on
   `location.directory` plus a 15-minute recency window; re-measured at 35,609 (sum of this project's
   recent sessions) instead of 31.9 M.
2. `ctx.permission.list({})` throws `Missing key ["sessionID"]`; the snapshot now queries per restored
   session.
3. MCP status: `Mcp.Server.status` is an object `{ status: "connected" }`, not a string. The synthetic
   probe used a string and hid the bug. Fixed; the pipeline is verified with the real shape injected
   through the plugin runtime (`online=1 total=2`).
4. The logger redacted `plugin@version` as an e-mail address; the message no longer uses `@`.

## 5. Not validated live

| Item | Why | Where it stands |
| --- | --- | --- |
| `permission.asked` notification | a non-interactive `run` did not ask for `ls`; forcing one requires interactive approval | payload and projection verified by schema and unit test; **NOT VERIFIED live** |
| `form.created` (user input) | no safe way to make a model request a form | as above |
| Two **active** executions at once | two `--standalone` runs serialize (peer 6 ended before peer 7 started); overlap < 1.3 s | reducer has multi-session tests; live overlap **NOT VERIFIED** |
| MCP Radar with real payloads | the last real run still reported `0/0`; the pipeline works with the real schema injected, so the remaining cause is in the real event delivery, not in the mapping | **PARTIALLY VERIFIED** |
| One-hour soak | Phase 2 carry-over | still **OPEN** |
