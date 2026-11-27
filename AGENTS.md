# AGENTS.md — operating rules for OpenCode Buddy

Instructions for any AI agent or developer working in this repository. Read this file completely
before changing code, configuration, documentation or hardware.

## 1. Non-negotiable constraints

1. **Never flash the ESP32 without explicit user approval.** Flashing replaces the firmware that is
   currently on the device; a restore path must be agreed first.
2. **Never modify, move or delete the reference project** (`../Codex-Quota-Mini`). It is read-only
   input for hardware facts.
3. **Never commit secrets or private data**: tokens, API keys, credentials, internal hostnames,
   employer or customer names, proxy details, private MCP server names, user prompts, model output,
   tool arguments, shell commands, file contents, absolute home directories.
4. **Never disable security controls** (TLS verification, enterprise proxying, permission prompts) to
   make a build or a test pass.
5. **No automatic permission approval, no remote execution, no telemetry.** The device is a display
   and an input *request* surface, never an approval authority.
6. **Do not modify the user's existing OpenCode configuration** without approval. Development uses
   project-local `.opencode/` files or a dedicated profile.
7. **Do not invent API surface.** Event names, payload fields, SDK methods and config keys must be
   verified against the installed OpenCode version (see §4).
8. **No placeholder code that pretends to work.** Mock and simulator paths must be labelled as such
   in code, UI and logs.

## 2. Verified hardware facts (do not re-derive, do not "improve")

Source: reference firmware `../Codex-Quota-Mini/include/display.h` and `src/main.cpp` (read-only).

| Signal | ESP32-C3 GPIO | Evidence |
| --- | --- | --- |
| SPI SCLK | GPIO2 | `spi.pin_sclk = 2` |
| SPI MOSI (SDA) | GPIO4 | `spi.pin_mosi = 4` |
| SPI MISO | not connected | `spi.pin_miso = -1` |
| Display DC | GPIO1 | `spi.pin_dc = 1` |
| Display CS | GPIO5 | `panel.pin_cs = 5` |
| Display RST | GPIO0 | `panel.pin_rst = 0` |
| Touch output | GPIO6 | `kTouchPin = 6`, `INPUT_PULLDOWN` |
| Touch active level | HIGH | `digitalRead(kTouchPin) == HIGH` |

Display: `Panel_GC9A01`, `SPI2_HOST`, 27 MHz write clock, `invert = true`, `rgb_order = true`.
Toolchain: PlatformIO, `platform = espressif32@6.5.0`, `board = esp32-c3-devkitm-1`,
`framework = arduino`, `-DARDUINO_USB_MODE=1 -DARDUINO_USB_CDC_ON_BOOT=1`.
Libraries proven with this panel: LovyanGFX 1.2.21, ArduinoJson 7.4.3.

Full evidence and open electrical risks: [docs/hardware-audit.md](docs/hardware-audit.md).

## 3. Target platform facts

- OpenCode **v2** only. v1 server and plugin APIs are intentionally incompatible; do not copy v1
  patterns. Migration notes only when explicitly asked.
- The plugin runs **inside the OpenCode server** and receives events in-process; no polling loop and
  no screen scraping.
- The bridge and the device are optional. **OpenCode must keep working when the Buddy is absent.**
- Wi-Fi and Bluetooth are **disabled** on the device. USB carries power and data.

## 4. Source-of-truth order

1. The running local server's OpenAPI document (`opencode api get /openapi.json`).
2. Installed type declarations of `@opencode/plugin` / `@opencode/client` pinned to the CLI version.
3. Official v2 documentation at `https://opencode.ai/docs/`.
4. This repository's audit documents (`docs/opencode-api-audit.md`).

If 1–3 disagree with this repository, the repository is wrong: update it and record the change.
Never guess an event name, field name or status value.

For the USB link, the single source of truth is [protocol/protocol-v1.md](protocol/protocol-v1.md)
(ratified), its JSON Schema and the shared vectors in `protocol/test-vectors/`. The firmware and the
bridge must both pass those vectors before a change is considered correct.

## 5. Development rules

- SOLID where it applies, one clear responsibility per component, small testable units.
- TypeScript: strict mode, no `any` in public contracts, explicit error handling, small modules.
- Firmware: C++17, non-blocking loop, no `delay()` in animation or serial paths, bounded buffers,
  no unbounded dynamic allocation in steady state, no `String` growth loops.
- Rendering: dark theme, high contrast, circular safe area, shapes + text + motion (never colour
  alone), target 20–30 FPS with partial refresh.
- State: deterministic reducer; connection state and execution state are separate; a pending
  permission in any session outranks normal execution.
- Privacy: allowlist filtering twice (plugin → bridge, bridge → device). Default-deny unknown fields.
- Dependencies: justify each one, check license and security, pin versions, prefer the standard
  library. No dependency that phones home.
- Errors: handle them explicitly at every boundary; never swallow a failure silently, and never
  replace a real error with a plausible-looking default.
- Builds: reproducible from a pinned configuration. A build is only "passing" when the command
  actually completed in this session.
- Tests: meaningful and reproducible; a test that cannot fail proves nothing.
- Mocks: any simulated data path must be labelled in code, in logs and on screen. No placeholder may
  silently stand in for production behaviour.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), small and
  reviewable. Semantic Versioning for releases.
- Documentation changes ship in the same commit as the behaviour they describe.

## 6. Phase discipline

Work proceeds Phase 0 → 6 as defined in [docs/roadmap.md](docs/roadmap.md). Do not start a phase
before its gate is approved by the user. When a phase ends, write a report modelled on
`docs/phase-0-report.md` with: summary, completed tasks, files touched, decisions, commands run,
build results, test results, security findings, limitations, remaining work, commit/issue references,
and a recommendation.

Classify every technical statement as **VERIFIED**, **ASSUMPTION**, **NOT VERIFIED** or **BLOCKER**.
Never claim a build, a flash or a hardware test succeeded without evidence produced in this session.

## 7. Known environment traps

- `/dev/ttyACM0` is a single-owner resource. The pre-existing Codex Quota Mini bridge may hold it;
  two processes must never share it. Check before opening the port.
- PlatformIO Core is installed **project-locally** in the repository-root `.venv` (see
  `docs/phase-1-report.md`), not system-wide. The PlatformIO registry may be unreachable behind the
  corporate proxy: use the system trust store (`--system-certs` for `uv`, `REQUESTS_CA_BUNDLE`) and
  the git-ignored `firmware/platformio.local.ini` fallback. Never disable TLS verification.
- The GitHub remote is owned by the Product Owner. Agents never push, pull, fetch, create issues or
  use GitHub CLI/MCP/API; see §8.
- Do not print environment variables, credentials or full configuration files into logs or reports.

## 8. GitHub ownership (Product Owner)

The Product Owner manages every remote GitHub operation personally and manually. This is a permanent
project rule, not a temporary workaround.

- Work exclusively in the local repository. Local commits are allowed and expected.
- Never run `git push`, `git pull`, `git fetch` or `git ls-remote`.
- Never use GitHub CLI, the GitHub MCP server or the GitHub API.
- Never create, edit or close issues, pull requests or releases remotely.
- Never configure credentials, tokens, SSH keys or credential helpers.
- Do not attempt to resolve the former blocker **B-01**. It is reclassified as a Product Owner
  responsibility and is **not** a development blocker. Do not mention it as a blocker in new reports;
  record it only as "remote publication handled by the Product Owner".
- The issue bodies under `.github/issues/` and the scripts under `scripts/` remain available **for the
  Product Owner**. Agents must not execute the GitHub scripts.
- Never force-push or rewrite published history, even if remote access were available.

## 9. Phase 3 integration facts (verified on 2026-11-25)

- OpenCode **2.4.1**, `@opencode/cli` via npm global; plugins run inside the server on **Bun**.
- Plugin SDK `@opencode/plugin@2.0.16`: `{ id, setup(ctx) }`, `ctx.event.subscribe()`.
  `Plugin.define` is an identity function — importing it is optional.
- A configured plugin path must be a **directory**; a file path is skipped with a warning.
- The server-wide event stream carries every location: filter on `location.directory`.
- Local IPC is a Unix socket in `0700` with a `0600` per-run token (see `docs/security.md` §5).
  Node and Bun expose no portable `SO_PEERCRED`, so the token is the second factor.
- LIVE is the default (`npm run live`); MOCK is explicit (`npm run mock`); no fallback exists.
- Never run `opencode service restart` while an agent session is running: it kills that session.

## 10. Rendering conventions

- Use Theme and the indexed 220-square sprite for dashboard and face changes. Fit text using
  LovyanGFX font measurements and the safe chord at both vertical edges of its box.
- Preserve independent availability of optional metrics. Use wide arithmetic for totals and ratios.
  Show the data source on every mock page, including standalone MCP detail.
- Use monotonic state-entry time for one-shot effects. Keep quiet frames still and repeated
  snapshots idempotent. Rebuild the native preview and review both contact sheets after layout edits.
- Distinguish host pixel verification from panel measurements in design reports.

## 11. Phase 3.1 invariants (verified 2026-11-26)

These are hard rules for future changes, established by the independent audit.

1. **One bridge per runtime directory.** `IpcServer` takes a PID lock before touching the token or
   socket. Never delete `bridge.lock`, the socket or the token of a live bridge. The runtime directory
   must be a real 0700 directory owned by the user; refuse symlinks and non-socket paths.
2. **Activity and interactions are separate.** `SessionState.status` is execution activity;
   `permission_required` and `user_input_required` are derived from pending identifiers. Never store an
   interaction state in `status`.
3. **Metrics are session-scoped.** The device receives the focus session's tokens and tools. Unknown
   counters stay `null`; never turn them into zero. At equal priority the most recently updated session
   is the focus.
4. **One peer owns its sessions.** A disconnect, stale timeout or `source=degraded` closes only that
   peer's sessions; terminal notifications survive for their TTL. Ownership is bounded (64 per peer).
5. **The plugin output is bounded.** Queue, socket buffer and frame size are bounded; sizes are
   measured in UTF-8 bytes (`Buffer.byteLength`). Snapshots carry one timestamp and a generation.
6. **The device owns display preferences.** `language`/`quietMode` are optional in `config`; a firmware
   advertises `caps:["config.partial"]`. The bridge sends legacy fields only to a firmware without it.
7. **Serial frames go through `TxBuffer`.** Never write a frame directly to `Serial`; a partial driver
   write must be retried from the buffer, and no frame may block the rendering loop.
8. **Plugin diagnostics are private and sanitized.** Opt-in only, runtime directory 0700, file 0600,
   1 MiB cap, no paths, session IDs, request IDs or raw errors.
9. **Firmware flash is validated.** The Phase 3.1 release (`sha256 280166…e12ad`) was flashed
   application-only and hardware validated on 2026-11-26; the diagnostic image must never remain
   installed. A USB power-cycle may show one transient `E_PARSE` + resync while the device boots; it
   recovers in about 2 s (documented in `docs/evidence/phase-3-1-hardware-validation.md` §9).
10. **The first snapshot is ACK-gated.** Never send `state` or `mcp_status` before the device
    acknowledges `ready`/`config`; this prevents state reaching a device that is still booting.
11. **MOCK stress cycles stay coherent.** One 12-phase cycle runs on one session, resolves every
    permission/question and every tool, and is never presented as LIVE behaviour.
12. **State and MCP never share a burst.** `state` and `mcp_status` are sent on separate ticks; the
    MCP detail is sent only when it changes, and a resync adopts the device's `expected` sequence.
    With eight MCP servers the two frames together exceed the 1024-byte device RX queue.

## 12. Phase 4 invariants (verified 2026-11-26)

1. **Localization is centralized.** Every fixed label is a `TextId` in `Localization.cpp` with an
   English, French and German entry. Renderers never concatenate translated fragments. The three
   tables are complete; `test_localization.cpp` fails on a missing or unsupported entry.
2. **Accents are composed, not invented.** The bundled fonts are ASCII-only; Latin-1 letters use the
   same font's base glyph plus a primitive mark placed on the measured cap/x-height (or below the
   baseline for a cedilla). ASCII strings keep the single `drawString()` path.
3. **Session totals are not context.** The Tokens page says `SESSION TOTAL`; `CTX` stays `--` until a
   verified occupancy and capacity exist. Reasoning/cache counters stay internal and are never added
   to the total. A wide token sum omits the uint32 `total` field and is derived in 64-bit on the
   device.
4. **MCP totals outrank details.** At most eight details are drawn; `n/total shown` is displayed when
   the list is a subset. Real MCP names stay disabled by default.
5. **Preferences are device-owned.** `language`/`quietMode` are optional in `config`; a host override
   is explicit, applies without reboot and is persisted only on change. Gestures are unchanged; the
   supported configuration workflow is the local configuration file.
6. **Optional fields are capability-gated.** `versions.opencode` is sent only to a firmware that
   advertises `state.opencodeVersion`; a legacy firmware receives the legacy config fields.
7. **No firmware is flashed without approval.** The Product Owner authorizes application-only
   flashes at `0x10000`; bootloader, partitions and NVS are never rewritten.
8. **The USB CDC self-echo is a permanent constraint.** The ESP32-C3 delivers a fragment of the
   device's own transmission into its RX at cold boot. Three protections must stay: the parser
   recovers a complete peer frame behind an invalid prefix (`ProtocolParser::findFrameStart`, bounded,
   counter `framingResyncs()`), the firmware drains RX while `!hostConnected()`, and the bridge
   replays an unacknowledged `ready`/`config` (ready restarting at seq 1) before the 7 s reopen.
   Never "fix" a handshake by raising timeouts or buffer sizes.
9. **Phase 4.1 is the verified device baseline.** Image
   `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` is verified on the device.
   Phase 5 software is accepted; hardware validation is deferred to Phase 6. RC1 `dd7d1d57…` is
   frozen; the clean rebuild `f9cc72ee…` is code/data-identical. No diagnostic image may stay
   installed. The original Phase 4 failure report is historical evidence and is never rewritten.


## 13. Phase 5 closure and Phase 6 environment (Product Owner decision, 2026-11-27)

1. **Verdict: SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED.** The Phase 5 software gates are
   accepted. The USB handshake/RX blocker is **not** declared resolved.
2. **Environment is not the reference.** The ESP32-C3 is connected to a Windows host and redirected
   into a VMware Ubuntu VM. This additional USB-virtualisation layer is **not** retained as the
   reference environment for final hardware acceptance. VM/VMware must **not** be declared the
   confirmed root cause of the observed USB behaviour: the root cause remains unproven.
3. **Stop the investigations.** In the current environment, do not run USB diagnostics, experimental
   HWCDC or USB-driver changes, handshake corrections, cold-boot or USB-reconnection campaigns,
   hardware benchmarks, soak/endurance tests, or experimental flashes. Do not flash or manipulate
   the device. The device stays as preserved.
4. **Freeze the candidate.** RC1 `dd7d1d57…` (413 344 B) is the frozen release candidate; the clean
   rebuild `f9cc72ee…` is code/data-identical (only the embedded ELF SHA and image validation hash
   differ). Do not change functional RC1 code without explicit Product Owner justification and
   authorisation.
5. **Preserve evidence.** Keep every artifact and report listed in `docs/handover-phase5.md`:
   Phase 4.1, RC1, the rebuild, both full 4 MiB backups, all diagnostic images and all historical
   failure evidence. Never delete a proof of a problem encountered.
6. **Phase 6 hardware validation** happens on a **native physical Windows or Linux computer without
   USB virtualisation**. The remaining cold boots, USB reconnections, soak, endurance, six-screen
   measurements and performance validation are Phase 6 gates.
7. **Phase 6 Checkpoint A is authorized; B/C/D are not.** Checkpoint A implements the native base and
   installation architecture. Checkpoints B/C/D (native hardware acceptance, cold boots, soak,
   endurance, performance) require a separate instruction and a native physical host. No firmware
   flash, physical manipulation or VMware USB campaign is allowed in Checkpoint A.
8. **Mocked Windows behaviour is not native verification.** Named-pipe/ACL/COM/installer tests that
   run on Linux are AUTOMATED/MOCK. Do not claim a platform is supported until its native
   installation and execution are tested.
9. **Installation safety.** Never modify the real global OpenCode configuration during development,
   never register a real startup service without authorization, always back up a configuration
   before an applied merge, and never remove OpenCode, unrelated plugins, MCP servers or user data.
   The frozen RC1 firmware and all Phase 5 evidence remain untouched.
