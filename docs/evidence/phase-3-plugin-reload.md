# Phase 3 evidence — plugin entry loaded without an OpenCode restart

Date: 2026-11-26
Scope: does a newly added **project-local** plugin entry require `opencode service restart`?
Classification: **VERIFIED** for OpenCode 2.4.1, project-local configuration, Linux.
Related: `docs/plugin-installation.md` §3.1, `docs/troubleshooting.md` ("Plugin does not load").

## 1. Question

`docs/plugin-installation.md` told the reader to restart OpenCode after adding the plugin entry, while
`docs/troubleshooting.md` stated that configuration changes reload without a restart. Both cannot be
right; a restart also ends any running agent session, so the difference matters in practice.

## 2. Environment

| Item | Value |
| --- | --- |
| OpenCode | 2.4.1, `opencode serve --service` |
| Plugin | `plugin/opencode-buddy` 0.1.0, IPC v1 |
| Node | 24.22.3 |
| OS | Linux, `XDG_RUNTIME_DIR` available |
| Configuration | project-local `<repo>/opencode.json`, no entry in the global file |
| Device | ESP32-C3 `303a:1001` on `/dev/ttyACM0` |

## 3. Timeline (local time, CET)

| Time | Event |
| --- | --- |
| 08:40:40 | `opencode serve --service` starts, PID 6272 |
| 09:11:56 | `opencode.json` written with the plugin directory |
| 09:12:09 | LIVE bridge starts for a bounded 20 s test; `ipc listening` |
| 09:12:09 | bridge `status=ready` after the USB handshake |
| 09:12:12 | `opencode peer=1` and `peer=2`, `app=cli version=2.4.1` |
| 09:12:29 | test ends on its own (`--duration 20000`) |
| 09:14:30 | persistent LIVE bridge starts |
| 09:14:44 | both peers reconnect (plugin 1 s → 15 s backoff) |

## 4. How "no restart" was established

- `ps -o lstart -p 6272` showed the server still running with PID 6272 and a start time **before** the
  configuration file existed; `/proc/6272` was still present after the plugin connected.
- The agent session that performed the change kept running across the whole sequence; a service
  restart would have terminated it (`AGENTS.md` §9).
- The bridge log records the peer handshake and real MCP data (`mcp online=8 total=12`) within 16 s of
  the file being written.

## 5. Result

A project-local plugin entry is picked up by an already running OpenCode 2.4.1 server. No service
restart is required, and no agent session is interrupted. The plugin connects as soon as the bridge
socket exists; when the bridge is started later, the plugin reconnects within its 1 s → 15 s backoff.

## 6. Limits and non-claims

1. The **global** configuration was not tested for hot reload. A restart remains the reliable path
   there, and the documentation says so.
2. Removal was not tested. A restart is still required to make the server **unload** the plugin.
3. The exact moment the server reads the project configuration was not instrumented. The evidence
   proves that no restart was needed, not that loading is instantaneous.
4. Only OpenCode 2.4.1 was tested; other versions may differ.
5. At the time of the test, `npm run diagnose:opencode` read the global file only and reported a false
   `WARN` for this project-local install. It now reads the project files too
   (`plugin configured (project)`), so that warning is gone; the bridge log remains the authoritative
   check.

## 7. Reproduction

1. Start OpenCode with no Buddy entry in any configuration.
2. Start the bridge (`npm run live`): no peer connects, the device stays IDLE, `mcp online=0`.
3. Write `<project>/opencode.json` with the plugin directory
   (`node scripts/install-buddy-plugin.mjs --project <project>`).
4. Keep the server running; within about 15–20 s the bridge logs `opencode peer=N`.
