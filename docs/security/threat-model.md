# OpenCode Buddy — threat model

Date: 2026-11-27
Companion to `docs/security/privacy.md` and `docs/security/security-review.md`. Scope: the local
product (OpenCode plugin, bridge, USB link, firmware, preview/diagnostics). Windows named pipes,
packaging and remote distribution are Phase 6 and are out of scope.

## 1. System and data flow

```
OpenCode server (2.4.1)
  │  public event stream, in-process plugin
  ▼
plugin/opencode-buddy  (projection + local socket client)
  │  NDJSON over a Unix socket, 256-bit token in the first frame
  ▼
bridge (validation, session registry, reducer, privacy projection)
  │  NDJSON v1 over USB CDC (application-only, local)
  ▼
ESP32-C3 firmware (bounded parser, state, six dashboards, touch)
```

## 2. Assets

| Asset | Why it matters | Where it may live |
| --- | --- | --- |
| Prompts, model output, source code, tool arguments, tool output, shell commands, file contents | Confidentiality; must never leave OpenCode | Never in the plugin projection, the bridge or the device |
| Local paths, credentials, API keys, tokens | Confidentiality / access | Never in logs, docs or wire frames |
| IPC token | Authenticates the plugin to the bridge | Runtime dir, 0600, per bridge run |
| Permission/question decisions | Integrity; the device must not approve anything | OpenCode only |
| Availability of OpenCode | The Buddy must never disturb it | Plugin failure policy |
| Device preferences | Integrity/ownership | ESP32 NVS, device-owned |

## 3. Trust boundaries

| Id | Boundary | Trust direction | Controls |
| --- | --- | --- | --- |
| TB1 | OpenCode ↔ plugin | The plugin is trusted code but must not become a data exporter | Projection allowlist; no storage of raw events; failure isolation |
| TB2 | plugin ↔ bridge | Same user, local socket | 0700 dir, 0600 socket/token, 256-bit token, constant-time compare, hello timeout, rate/line caps, 8 peers |
| TB3 | bridge ↔ firmware | The device is untrusted input | Bounded NDJSON, strict validation, 2048 B lines, no executable payloads |
| TB4 | user ↔ firmware | Touch is an input request only | Four gestures, no approval path, no command execution |
| TB5 | bridge ↔ host files | Logs/diagnostics | Sanitization, bounded debug file (0600, 1 MiB), opt-in |
| TB6 | bridge ↔ device display | Privacy projection | Field-by-field rebuild, MCP aliases by default |

## 4. Threats and mitigations

| Id | Threat | Class | Mitigation | Verification | Residual |
| --- | --- | --- | --- | --- | --- |
| T1 | A local process connects to the socket and injects events | Spoofing | 0700 directory, 0600 socket, 256-bit token, constant-time compare, hello timeout 2 s | `ipc.test.ts` (bad token, no hello, permissions) | Same-user malware can read the token (0600) |
| T2 | Token theft/replay | Spoofing | New random token per bridge run; token deleted on stop; no network exposure | `ipc.test.ts`, code review | A same-user process that can read the runtime dir is inside the trust boundary |
| T3 | Socket or directory replacement (symlink) | Tampering | `lstat` refuses non-socket/symlink; ownership check; lock before touching shared files | `ipc.test.ts` non-socket case, directory checks | Root can do anything (out of scope) |
| T4 | Two bridges fight over the port | DoS | `bridge.lock` with PID liveness, atomic `wx` create, stale-lock recovery, preflight check | `ipc.test.ts` live/stale lock | A crashed process leaves a stale lock until the next start |
| T5 | Malformed IPC messages | Tampering | `parseIpcLine` default-deny; field bounds; unknown types rejected; 8 KB line | `ipc.test.ts`, 10 000-case IPC fuzz | None known |
| T6 | Resource exhaustion over IPC | DoS | 8 peers, 200 lines/s burst 400, 4×line buffer cap, plugin queue 500, socket buffer 256 KiB | `ipc.test.ts`, fuzz | A peer can still consume its bounded share |
| T7 | Sensitive data reaches the wire/logs | Information disclosure | Plugin projection + bridge privacy filter (double allowlist); redaction; MCP aliases default; no prompts/code/tool data anywhere | `privacy.test.ts`, `map.test.mjs`, `logger.test.ts` | A model/agent identifier could theoretically embed a path; redaction covers URLs/emails/long tokens, display fields are Latin-1/byte-bounded |
| T8 | Malicious serial input crashes the device | DoS/Tampering | 2048 B line, `TooLong`, strict JSON/type/sequence validation, 10 000-case C++ fuzz under ASan/UBSan | `firmware/test/host/test_fuzz.cpp` | Physical USB access is out of scope |
| T9 | JSON parser abuse (deep nesting, huge numbers) | DoS | ArduinoJson bounds; 10 000-case fuzz with 200-level nesting; numeric bounds | Same fuzz | None observed |
| T10 | Oversized/concatenated frames | Tampering | Framer discards >2048 B up to newline; per-chunk overflow count (P1-01 fix); one object per line | `protocol.test.ts`, `fuzz.test.ts` | None known |
| T11 | Unauthorized configuration overrides | Elevation | Preferences are device-owned; host overrides are explicit; MCP real names require `allowRealMcpNames: true`; CLI config is local | `config.test.ts`, `bridge.test.ts`, `privacy.test.ts` | The user can always override locally by design |
| T12 | Log leakage | Information disclosure | `sanitize()` redacts URLs, e-mails, absolute paths, 40+ char tokens; 200-char lines; plugin debug opt-in 0600 1 MiB | `logger.test.ts`, review | Logs are transient and local |
| T13 | Dependency compromise | Supply chain | Pinned `package-lock.json`, pinned PlatformIO packages, license inventory, SBOM | `dependencies.md`, SBOM | Advisory data unavailable (registry audit endpoint requires authentication) — **NOT VERIFIED** |
| T14 | Touch approves a permission or runs a command | Elevation | The device sends only `interaction` frames; the bridge only logs them; there is no API call from an interaction | Code review (`live.ts`), protocol | None by design |
| T15 | Stale peers/sessions shown as live | Integrity | 15 s peer watchdog, per-peer session ownership, 64 sessions/peer, hard 256 ceiling, MCP cleared when OpenCode is offline | `ipc.test.ts`, `reducer.test.ts` | None known |
| T16 | Plugin timestamps freeze a session | Tampering | Future timestamps clamped at the LiveSource boundary; past timestamps preserved for long executions | `ipc.test.ts` | Same-user plugin is trusted for content |
| T17 | USB CDC self-echo corrupts the first host frame | DoS | Parser frame recovery, RX drain while no host, handshake replay, bounded framing | Phase 4.1 evidence; P5-00 blocker open for the first open after a long idle | **Open**: first-open handshake can still fail (documented in `docs/evidence/phase-5-hardware-validation.md`) |

## 5. Out of scope

- A user with root, or code running as the same user as the bridge (it can read the token and the
  OpenCode data directly).
- Physical attacks on the ESP32 (flash readout, fault injection).
- Windows named pipes and installers (Phase 6).
- The corporate TLS/proxy infrastructure; no TLS validation is disabled anywhere.

## 6. Review cadence

Re-run this model when a trust boundary, a dependency, the IPC framing, the privacy projection or
the device protocol changes. The P5-00 handshake blocker must be closed before release.

## 7. Phase 6 Checkpoint A addendum (native IPC, installation, packaging)

Scope now includes Windows named pipes, the portable app tree, plugin/startup installation, user
configuration and the firmware manifest. The historical threats remain; this section adds the new
boundaries. Windows behaviour is **AUTOMATED/MOCK** until a native physical host verifies it.

| Id | Boundary | Trust direction | Controls |
| --- | --- | --- | --- |
| TB7 | plugin ↔ bridge on Windows | Same user, local named pipe | Per-user runtime dir, derived pipe name, 0600 token/descriptor where supported, 256-bit token in the hello, `icacls` best effort, same shared rate/line/lock logic |
| TB8 | installer ↔ OpenCode configuration | User-owned file | Dry-run default, textual JSONC merge, backup before apply, only the Buddy entry, targeted uninstall |
| TB9 | startup definition ↔ OS | User session | User-scoped definition, no elevation, hidden Windows script, no real service registered during development |
| TB10 | package ↔ user | Offline archive | SHA-256 archive checksum, pinned lockfile/runtime tree, SBOM and notices; unsigned Windows installer is documented, never bypassed |
| TB11 | firmware manager ↔ device | Explicit human approval | Manifest SHA-256/size, app-only offset, bridge stopped, independent read-back, rollback preserved, no automatic flash |

| Id | Threat | Class | Mitigation | Verification | Residual |
| --- | --- | --- | --- | --- | --- |
| T18 | Another local Windows user connects to the pipe | Spoofing | Per-user runtime dir, unguessable pipe suffix, 256-bit token, hello timeout, constant-time compare; `icacls` best effort | AUTOMATED/MOCK only | Windows pipe DACL not native-verified; a process in the same user session is inside the trust boundary |
| T19 | Token/descriptor readable by another user | Information disclosure | 0600 file modes where supported; `icacls /inheritance:r /grant:r <user>:F`; per-run token | AUTOMATED/MOCK | Native ACL verification required; failure is logged but does not fail the bridge |
| T20 | Installer damages JSONC/providers/MCP/skills | Tampering | Textual plugin-array edit, parse/validate, backup, idempotence, targeted uninstall, fixtures | `scripts/test/plugin-install.test.mjs` | Exotic JSONC formatting may require manual review; the installer refuses invalid input |
| T21 | Uninstall removes unrelated data | Tampering | Remove only app prefix/launcher/Buddy plugin entry; never OpenCode, Node, other plugins or MCP | Installer tests/demo | User files outside the prefix are untouched by design |
| T22 | Startup needs elevation or exposes a console | Elevation | User-scoped systemd/Startup definition, hidden VBS, no admin, no real registration in development | Generator tests | Native startup/login behaviour pending B |
| T23 | Tampered package/archive | Tampering | SHA-256 checksum, pinned runtime tree, SBOM/notices; no remote update check | Build/demo checksum | Archive is unsigned; signature/signing decision pending |
| T24 | Firmware flashed to the wrong device or automatically | Tampering | Explicit approval, manifest verification, device identity, bridge stopped, app-only offset, read-back, rollback | `scripts/test/firmware-verify.test.mjs`; no flash | Native flash procedure pending B |
| T25 | `icacls` unavailable/fails | Information disclosure | Log warning, retain token/pipe-name controls, never log the token | ACL helper test | Cannot guarantee DACL hardening without native verification |

Updated out-of-scope: no TCP/HTTP listener, no automatic remote update, no telemetry, no approval or
execution from the device. A future bundled Node runtime must carry its notices and update process.
