# OpenCode Buddy — privacy

Date: 2026-11-27
The Buddy is a display and an input request surface for OpenCode. It is not a data exporter.

## 1. What never leaves OpenCode

The plugin projects the public event stream field by field. It never reads or forwards:

- prompts and model output;
- source code, diffs or file contents;
- tool arguments, tool output, shell commands;
- local paths, working directories, repository names;
- credentials, API keys, tokens;
- MCP server endpoints or environment values.

`plugin/opencode-buddy/map.js` documents this contract and only names the fields it copies. The
bridge's `PrivacyFilter` then rebuilds the outbound object field by field, so a new upstream field
cannot reach the device without an explicit change.

## 2. What is transmitted

| Field | Content | Bound |
| --- | --- | --- |
| `status` | one of the twelve companion states (idle, thinking, generating, working, permission_required, user_input_required, retrying, compacting, success, error, interrupted, offline) | enum |
| `model`, `agent` | identifiers only, e.g. `deepseek-v4.1-flash`, `build` | 40 B / 24 B, printable Latin-1, redacted if URL/e-mail/long token |
| `activeSessions`, elapsed, pending permissions/questions, notifications, retry | counters | uint16/uint32/uint8 |
| `tokens` | cumulative input/output of the focus session; `total` derived; `contextPct` always null | uint32 per operand; wider values are unknown |
| `tools` | success/failed/running and six categories | uint32/uint8 |
| `mcp` | online/total and up to eight alias/status pairs | aliases `MCP-1…` by default |
| `versions` | bridge, protocol, optional OpenCode version (all peers must agree) | 16 B |
| `source` | `live` or `mock` | enum |
| `diagnostic` | short error code, no text | enum |

The device shows the data source (`LIVE`, `MOCK`, `OFFLINE`, `STALE`) on every screen, including the
MCP detail, so a simulated or stale value cannot be mistaken for live data.

## 3. Double allowlist

1. **Plugin**: `map.js` reads only the named fields; `isolation.js` restricts events to the plugin's
   project location; the wire layer bounds frames (8 KiB) and buffers.
2. **Bridge**: `PrivacyFilter.projectState/projectMcp` rebuilds the object, clamps counters, redacts
   URLs/e-mails/token-like strings, enforces Latin-1 and byte limits, and drops unknown diagnostic
   codes.
3. **Firmware**: the protocol parser accepts only the documented fields (`onlyKeys`) and bounds every
   string and counter; unknown fields reject the message.

## 4. MCP names

Real MCP server names are **not** sent by default. The bridge assigns stable aliases (`MCP-1…`) per
run. `allowRealMcpNames: true` is an explicit local opt-in; names are then truncated to 12 bytes and
the limitation is documented. The device never receives endpoints, tokens or tool names.

## 5. Preferences and ownership

`language` and `quietMode` belong to the device (NVS) and are omitted from `config` unless the host
sets an explicit override. `autoReturnSeconds` is host-side. A very long press resets the device
preferences locally. The host never reads the device's preferences back.

## 6. Logs and diagnostics

- The bridge logger sanitizes every line: control characters, URLs, e-mails, absolute paths and
  40+ character token-like strings are replaced; lines are cut at 200 characters. Log level defaults
  to `info`; `debug` is explicit.
- The plugin is silent by default. `OPENCODE_BUDDY_DEBUG=1` writes to a 0600 file capped at 1 MiB,
  with paths and IDs redacted; it is opt-in and can be disabled.
- The release firmware has diagnostics compiled out. A diagnostic image, when used for a measurement,
  is a separate flash, is labelled, and must not remain installed.
- No telemetry, analytics, cloud service, Wi-Fi or Bluetooth is used. USB carries power and data.

## 7. Retention

Metrics live in bridge memory only and are pruned (30 min TTL, 64 sessions/peer, hard 256). Logs are
local files; the user controls their retention. The device stores only its three preferences.

## 8. Verification

- `bridge/test/privacy.test.ts`: unknown upstream fields, redaction, token overflow (V02), MCP
  consistency, byte-bounded Latin-1 strings.
- `plugin/opencode-buddy/map.test.mjs` and `isolation.test.mjs`: projection allowlist, location
  ownership, session ownership.
- `bridge/test/logger.test.ts`: sanitization of paths, URLs, e-mails and tokens.
- `bridge/test/fuzz.test.ts`: 10 000 malformed IPC/normalizer inputs, no accepted out-of-schema field.
- Manual: the six screens show the source caption; MOCK is explicit; `CTX --` until a verified
  occupancy exists.

Privacy is a release gate: any new field on the wire needs a test in `privacy.test.ts` and an entry in
this document.
