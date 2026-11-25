# Phase 3 — security validation

## 1. Access control on the local IPC

| Check | Result | Evidence |
| --- | --- | --- |
| Directory mode | `0700` | `stat` in test, `ls -l /run/user/1000/opencode-buddy` |
| Socket mode | `0600` | same |
| Token file mode | `0600`, 64 hex chars (256 bits) | test `ipc socket and token are private` |
| Token compared in constant time | `crypto.timingSafeEqual`, length pre-check | `bridge/src/ipc/server.ts` |
| Payload before authentication | connection destroyed; not parsed | test `an event before hello closes the connection` |
| Authentication window | 2 s, then destroyed | `IPC_HELLO_TIMEOUT_MS` |
| Peers | max 8, one per OpenCode location | `IPC_MAX_CONNECTIONS` |
| Line bound | 8 KiB; oversized line destroys the connection | `parseIpcLine` + server framing |
| Rate limit | 200 msg/s, burst 400 | token bucket in `accept()` |
| Network exposure | none: no TCP listener, no UDP, no DNS | no `listen` on an inet address anywhere in `src/` |

**Deviation, documented:** the Phase 3 design note prefers `SO_PEERCRED` in addition to filesystem
permissions. Node and Bun expose no portable peer-credential API without a native addon, so the
second layer is a per-run token. A process running as the same user can read the token — it could also
read the OpenCode database directly, so the residual risk is unchanged.

## 2. Data that cannot leave the plugin

The projector has no branch that copies `data.delta`, `data.text`, `data.input`, `data.content`,
`data.error`, `data.metadata`, `data.title`, `data.resources`, `data.files` or `data.path`. The unit test
feeds four sentinel strings through `session.created`, `session.text.delta`, `session.tool.called` and
`session.tool.success` and asserts that none appears in the projected JSON.

Second filter: the bridge re-validates every message with the existing default-deny normalizer
(`normalizeEvent`), which rebuilds each event field by field.

Third filter: the bridge's `PrivacyFilter` rebuilds the outbound `state` and `mcp_status` objects and
redacts URLs, e-mails, long tokens and control characters.

MCP server names are replaced by `MCP-1…MCP-8` before the registry unless `allowRealMcpNames` is
enabled; a regression test asserts `context7` does not appear in the event.

## 3. Read-only guarantees

| Guarantee | How |
| --- | --- |
| Plugin never approves or rejects a permission | it only subscribes; `ctx.permission.*` is used for `list` only |
| Plugin never answers a form | no `form` API call |
| Plugin never runs a tool, shell or prompt | no `ctx.tool`, `ctx.shell`, `ctx.session.prompt` use |
| Device cannot trigger an action | NDJSON v1 has no command message; the touch sensor only emits `interaction` |
| No remote control | no network listener on either side |

A grep of the plugin sources for `permission.reply`, `session.prompt`, `session.command`, `shell.` and
`tool.transform` returns no match. The only `form.` occurrences are the event types it subscribes to
(`form.created`, `form.replied`, `form.cancelled`), never an answer API. The only listener in the
project is `net.createServer(...).listen(<unix path>)` in `bridge/src/ipc/server.ts`.

## 4. Findings from the live runs

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| S-30 | Snapshot restored other projects' sessions (cross-project data exposure to the device) | **High** | Fixed: location filter + 15 min window; re-measured |
| S-31 | MCP names would have reached the device verbatim | Medium | Fixed: alias before the registry + test |
| S-32 | Plugin debug could leak session identifiers if enabled in production | Low | Writes only with `OPENCODE_BUDDY_DEBUG=1`; documented; never content |
| S-33 | Same-user process can forge IPC messages with the token | Low | Accepted and documented; no privilege boundary existed to begin with |

## 5. Not verified

- Behaviour on Windows (named pipes) — not implemented.
- Hostile same-user process replaying captured frames — accepted risk, unchanged by design.
- Long-duration IPC fuzzing — only bounded, targeted malformed inputs are covered by tests.
