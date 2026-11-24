# Phase 0 report — Technical audit and initialization

Date: 2026-11-24 (first pass, baseline commit `f7bc964`; second verification pass and report update
the same day)
Repository: `punix81/OpenCode-Buddy` (branch `main`)
Status: **Phase 0 complete; awaiting architectural review and approval.**
Nothing was flashed, installed, rebuilt or pushed. No existing OpenCode configuration was modified.

Remote state at the end of this report: `origin/main` is still at `c6cb443` (initial commit); every
documentation commit after it exists **only locally**. Zero issues exist remotely.

## 1. Executive summary

The project is technically feasible with the hardware already owned and with the installed OpenCode
v2.4.1. The decisive finding is that OpenCode v2 exposes a **native, in-process plugin API with a rich
durable event stream**, which makes the required observability (execution lifecycle, reasoning,
generation, tools, retries, compaction, permissions, MCP status, token usage) achievable without
scraping, polling or guessing. Two requirements have no API support and must be represented honestly
on screen: remaining quota, and context percentage unless a reliable denominator is confirmed.

The hardware configuration is fully verified from working reference firmware, not inferred: pins,
display driver parameters, USB CDC mode and library versions are traced to source lines. The active
board is present and was identified over USB, but it currently runs the reference firmware and its
serial port is held by another bridge process — both are documented constraints for Phase 1/2.

Two blockers prevent closing the administrative part of Phase 0, and both are environment
prerequisites rather than design problems: **no GitHub write credential** (issues and push blocked)
and **no PlatformIO CLI** (firmware build blocked in Phase 1). Both have exact remedies and neither
blocks documentation, design or review.

A second verification pass on the same day re-checked every hardware and API claim against the
installed 2.4.1 surface, then corrected four internal inconsistencies in the design documents that
would have become implementation defects in Phase 1–3: the page indicator count, a missing
`notifications` allowlist entry, an undefined source for the System screen's version and diagnostic
rows, and the absence of an expiry rule for terminal states in the reducer. Details in §14.

Recommendation: approve the architecture, the hardware map, the protocol direction and the security
model; provide GitHub write access; approve installation of PlatformIO Core for Phase 1.

## 2. Phase status

| Phase | Status |
| --- | --- |
| 0 — audit and initialization | Complete, awaiting approval |
| 1 — firmware core | Blocked on PlatformIO CLI + approval to flash |
| 2 — protocol, bridge, simulator | Not started |
| 3 — OpenCode integration | Not started (API path verified) |
| 4 — dashboard | Not started |
| 5 — quality and security | Not started |
| 6 — packaging and pilot | Not started |

## 3. Completed tasks

1. Inspected the repository, its Git state, remote and history. It began with a single `Initial commit`;
   two baseline documentation commits followed, and a third records this verification pass. All three
   are local because the remote is read-only without a credential (B-01).
2. Located and read the reference project `../Codex-Quota-Mini` without modifying it; confirmed its
   working tree is clean.
3. Extracted and cited the exact hardware configuration: display SPI pins, panel parameters, touch
   pin and polarity, debounce, USB CDC mode, baud rate, line buffer, toolchain and library versions.
4. Identified the physical device over USB (Espressif USB JTAG/serial debug unit) and discovered that
   its serial port is exclusively held by a pre-existing bridge process.
5. Audited the installed OpenCode v2.4.1: CLI, background service, OpenAPI document, event inventory,
   plugin SDK types and client typings.
6. Built the observability matrix mapping every functional requirement to a verified event or a
   documented gap, and recorded the integration options that were rejected.
7. Wrote the requirements baseline (FR/NFR/CON with verification phase).
8. Wrote the architecture baseline: components, data flow, event mapping, state priority, failure
   modes, nine decision records and a resource budget.
9. Wrote the UI design: circular safe area, design tokens, all eleven companion states, six screens,
   gesture semantics and accessibility rules.
10. Wrote the security design: threats, data classification, complete field allowlist, three filtering
    points, logging and persistence rules, supply-chain policy, residual risks, acceptance checks.
11. Drafted protocol v1 with envelope, ten message types, lifecycle, sequence handling, version
    negotiation, bounds, recovery and compatibility rules, plus a draft JSON Schema and examples.
12. Created the repository scaffold, contribution and security policies, agent rules, issue templates,
    PR template, a JSON validation workflow and reproducible GitHub scripts.
13. Prepared the seven phase issue bodies and a dry-run-verified idempotent issue creation script.
14. Verified GitHub read access, confirmed zero existing issues, and documented the write-access
    blocker with the exact command that fails.
15. Recorded all findings with VERIFIED / ASSUMPTION / NOT VERIFIED / BLOCKER classification.
16. Second pass: independently re-read the reference `include/display.h`, `platformio.ini` and the
    touch/serial code in `src/main.cpp` and confirmed every pin, polarity, buffer and library claim.
17. Second pass: re-read the live OpenAPI component schemas for the eleven highest-value events and
    recorded payload-level constraints, including the fact that `mcp.status.changed` carries no
    status and that `permission.asked`/`tool.*` payloads contain the riskiest fields.
18. Second pass: corrected four design-document inconsistencies and one reducer defect (see §14).

## 4. Files created or modified

Modified:

- `README.md` — replaced the one-line placeholder with project overview, status, architecture, layout
  and documentation index.
- `.gitignore` — replaced Angular-oriented ignores with Node, firmware, secret and artefact rules.

Created:

```text
AGENTS.md  CHANGELOG.md  CONTRIBUTING.md  SECURITY.md  config.example.json
.editorconfig  .gitattributes
docs/architecture.md  docs/hardware-audit.md  docs/installation.md
docs/opencode-api-audit.md  docs/phase-0-report.md  docs/requirements.md
docs/roadmap.md  docs/security.md  docs/troubleshooting.md  docs/ui-design.md
protocol/protocol-v1.md  protocol/schemas/protocol-v1.schema.json  protocol/schemas/README.md
protocol/examples/{hello,state,mcp-status,interaction}.json  protocol/examples/README.md
firmware/README.md  bridge/README.md  plugin/README.md  simulator/README.md
hardware/wiring.md  hardware/bom.md  hardware/enclosure/README.md
scripts/create-issues.sh  scripts/verify-github-access.sh
.github/issues/phase-0.md … phase-6.md
.github/ISSUE_TEMPLATE/{bug_report.md,feature_request.md,config.yml}
.github/pull_request_template.md
.github/workflows/validate-json.yml  .github/workflows/README.md
```

No implementation code was written. `firmware/`, `bridge/`, `plugin/` and `simulator/` contain only
README files describing the planned structure; they do not pretend to work.

Second pass, modified for correctness (not rewritten):

- `docs/opencode-api-audit.md` — added §3.1 payload-level facts, §3.2 privacy consequence, the
  re-verification note in §1, and limitation L10.
- `docs/architecture.md` — added the terminal-state expiry rule and the non-expiring permission rule
  in §4.
- `docs/security.md` — added `notifications`, split `versions` into `fw`/`bridge`/`protocol`, and
  documented where version and diagnostic values come from.
- `docs/ui-design.md` — corrected the page-indicator count to six, removed the unmeasurable USB speed
  class and the unsourced bridge uptime row, and documented the version sources for the System screen.
- `protocol/protocol-v1.md` — added optional `versions` and `diagnostic` to the `state` snapshot,
  documented version provenance, and corrected the size budget.
- `protocol/schemas/protocol-v1.schema.json` and `protocol/examples/state.json` — same two optional
  objects, kept in sync with the prose.

## 5. Commands executed (evidence)

| Command | Result |
| --- | --- |
| `pwd`, `ls -la`, `git status`, `git remote -v`, `git log --oneline` | clean tree; origin `punix81/OpenCode-Buddy`; one initial commit |
| `opencode --version` | `2.4.1` |
| `opencode service status` | server running, loopback URL reported |
| `opencode api get /api/info` | server 2.4.1, PID and paths present |
| `opencode api get /openapi.json` | 146 paths, 542 schemas, 101 event variants in `V2Event` |
| `opencode models` | two DeepSeek-family models available |
| `opencode mcp list` | servers listed; several `pending` at first listing |
| `opencode api get /api/mcp` | 12 servers: 10 connected, 1 needs-auth, 1 failed (404) |
| `opencode api get /api/session` | sessions with model, agent, tokens, cost, timings |
| `curl /api/event` (no auth) | `UnauthorizedError: Authentication required` |
| `opencode api get /api/event` (5 s, idle) | no output — recorded NOT VERIFIED |
| `npm view @opencode/plugin version` | `2.4.1` (matches CLI) |
| `npm install @opencode/plugin@2.4.1 @opencode/client@2.4.1` in a scratch dir | installed; typings inspected |
| `cat ../Codex-Quota-Mini/include/display.h` | panel and SPI configuration |
| `cat ../Codex-Quota-Mini/platformio.ini` | platform 6.5.0, board, USB CDC flags, library pins |
| `sed`/read of `../Codex-Quota-Mini/src/main.cpp` | touch pin 6, active HIGH, debounce 35 ms, 512 B line buffer |
| `git -C ../Codex-Quota-Mini status --porcelain` | no output (clean, unmodified) |
| `lsusb`, `udevadm info`, `fuser` | Espressif `303a:1001`, `/dev/ttyACM0`, held by another process |
| `pio --version` | command not found |
| `arduino-cli version`, `core list` | 1.5.1; no indexes; download host unreachable |
| `git push --dry-run origin main` | `fatal: could not read Username for 'https://github.com'` |
| `curl api.github.com/repos/.../issues` | 0 existing issues |
| `bash -n scripts/*.sh` | syntax OK |
| `scripts/create-issues.sh --dry-run` | lists all seven issues, no credential, makes no change |
| `scripts/verify-github-access.sh` | read PASS, write BLOCKER, exit 1 (expected) |

### Second pass (same day, independent re-check)

| Command | Observed result |
| --- | --- |
| `git status --short --branch` | `## main...origin/main [ahead 2]` — two local commits, clean tree |
| `git ls-remote origin` | `HEAD` and `refs/heads/main` both `c6cb443` — remote unchanged |
| `git push --dry-run origin main` | `fatal: could not read Username for 'https://github.com': No such device or address` |
| `which gh`, `[ -n "$GITHUB_TOKEN" ]` | `gh` not installed; token unset |
| `curl api.github.com/.../issues?state=all` | `count: 0` |
| `opencode --version` | `2.4.1` |
| `opencode service status` | `http://127.0.0.1:49374` (loopback) |
| `opencode api get /openapi.json` | 467 461 B; 146 paths; 542 schemas; 101 `V2Event` variants |
| `npm view @opencode/plugin version` | `2.4.1` |
| `npm view @opencode/client version` | `2.4.1` |
| `opencode api get /api/mcp` | 12 servers: `connected` 10, `needs_auth` 1, `failed` 1 |
| `opencode api get /api/session` | sessions expose `agent`, `model{providerID,id,variant}`, `tokens{input,output,reasoning,cache}`, `cost`, `time` |
| `read include/display.h`, `platformio.ini`, grep of `src/main.cpp` | pins 2/4/1/5/0, MISO −1, 27 MHz, invert/rgb_order true, touch GPIO6 active HIGH, debounce 35 ms, RX buffer 1024, line buffer 512 |
| `lsusb` | `303a:1001 Espressif USB JTAG/serial debug unit` |
| `fuser -v /dev/ttyACM0` | held by `python3 -u bridge.py --port /dev/ttyACM0` (PID 8645) — the reference bridge |
| `command -v pio` | not found |
| `git -C ../Codex-Quota-Mini status --porcelain` | 0 lines — reference project still clean |
| parse every `*.json` in the repo | all parse; schema and examples valid JSON |
| regex secret scan of tracked docs/scripts | no credential-like assignment found |

## 6. Architectural decisions recorded

Full table with alternatives and rationale in `docs/architecture.md` §7. Summary:

| ADR | Decision |
| --- | --- |
| 001 | Native OpenCode server plugin as the primary event source (not HTTP polling, not log tailing). |
| 002 | Separate local bridge process for USB, metrics and resilience. |
| 003 | NDJSON over USB CDC with newline framing. |
| 004 | PlatformIO + LovyanGFX + GC9A01 panel, pinned to the proven versions. |
| 005 | 8-bit sprite with dirty regions, no 16-bit double buffer. |
| 006 | Firmware independent of OpenCode semantics. |
| 007 | Loopback-only IPC between plugin and bridge, per-run token. |
| 008 | MCP server names aliased by default. |
| 009 | Quiet mode implemented in firmware, configured by the bridge. |

## 7. Findings

### VERIFIED

- **V-01** Hardware pin map, panel parameters, USB CDC mode, baud rate, debounce and buffer sizes are
  exactly as recorded in `docs/hardware-audit.md` §1, traced to reference source lines.
- **V-02** A physical ESP32-C3 is connected (Espressif `303a:1001`, `/dev/ttyACM0`).
- **V-03** OpenCode 2.4.1 is installed and its background server is running.
- **V-04** `@opencode/plugin` 2.4.1 exists and its typings expose `Plugin.define`, `ctx.event.subscribe`,
  `ctx.session`, `ctx.permission`, `ctx.mcp`, `ctx.storage`, `ctx.options`.
- **V-05** The v2 event surface contains dedicated events for execution start/success/failure/
  interruption, step, reasoning, text, tool start/progress/success/failure, retry, compaction,
  permission asked/replied, forms, usage, model/agent selection, idle and MCP status (101 variants).
- **V-06** MCP status values are `connected`, `pending`, `disabled`, `failed`, `needs_auth`, and the
  live API reports real outcomes (10/1/1 across 12 servers).
- **V-07** The HTTP API requires authentication; anonymous SSE access is rejected.
- **V-08** The reference project is clean and was not modified.
- **V-09** The serial port is exclusively owned by a pre-existing process at audit time.
- **V-10** GitHub read access works, the repository is public, and it has zero issues.
- **V-11** PlatformIO CLI is absent from the machine.
- **V-12** Every hardware claim in `docs/hardware-audit.md` §1 was re-derived on the second pass from
  the reference source files, not from the earlier report: pins 2/4/1/5/0, MISO −1, 27 MHz, invert and
  rgb_order true, touch GPIO6 active HIGH, debounce 35 ms, RX buffer 1024 B, line buffer 512 B.
- **V-13** `@opencode/plugin` and `@opencode/client` both resolve to 2.4.1 from the configured
  registry, matching the CLI exactly. The plugin path is therefore version-aligned at audit time.
- **V-14** The plugin event API is documented, not just typed: `ctx.event.subscribe({types, signal})`
  returns an async iterable, `server.connected` is deliberately not delivered to plugins, and unknown
  type names are ignored with a warning. This removes the need to guess at the subscription contract.
- **V-15** `mcp.status.changed` carries only `{server}`. MCP state must be re-read through
  `ctx.mcp.list()`; a handler that expects a status in the event would show stale data. This is a
  payload fact from the installed schema, not an assumption.
- **V-16** `permission.asked` carries `resources`, `save`, `metadata`, `source` and `message`, and
  `session.tool.called` carries `input` and `native`. These are the real leakage vectors; the event
  names alone would have hidden them.
- **V-17** `form.created` is a typed user-input concept carrying `Form.Info {title, fields}`, so the
  "user input required" state has a real API basis rather than a hopeful mapping.
- **V-18** A reference bridge process (`bridge.py`, PID 8645) actively holds `/dev/ttyACM0`, and the
  board is still enumerated as Espressif `303a:1001`. The single-owner constraint is current, not
  historical.

### ASSUMPTION

- **A-01** `form.created` is a typed user-input concept (V-17), but that a blocking agent question
  raises it on CLI, TUI and Desktop is not proven; Phase 3 must observe a real question flow.
- **A-02** `session.usage.updated` reports cumulative per-session usage, so the reducer must take the
  maximum rather than sum deltas (Phase 3). The identical `tokens` shape on `Session.Info` supports
  this reading but does not prove it.
- **A-03** Context percentage is computable from a model context limit and session tokens; if the
  denominator is unstable, the screen must show "unavailable".
- **A-04** GPIO0 as display reset does not disturb boot strapping on this unit (reference works).
- **A-05** The 27 MHz SPI clock supports 20–30 FPS with partial refresh; needs measurement.
- **A-06** `serialport` is a suitable USB library on Windows and Linux in enterprise images.
- **A-07** The terminal-state TTLs added in this pass (`success` 4 s, `interrupted` 10 s, `error` 30 s)
  are UX choices, not OpenCode values. They are configurable and Phase 4 validates them with users.
- **A-08** The revised protocol size budget (state ≤ ~820 B; typical snapshot set ~1.3 kB) is
  arithmetic on the specified fields, not a measurement of a serialized encoder; Phase 2 measures the
  real bytes.

### NOT VERIFIED

- **N-01** End-to-end plugin event delivery on this machine (no plugin was loaded; no event captured).
- **N-02** Frame rate, memory high-water mark and brown-out margin on hardware.
- **N-03** The CI workflow was never executed on GitHub.
- **N-04** No build was performed: the firmware does not exist and PlatformIO is missing.
- **N-05** macOS behaviour.
- **N-06** Behaviour with a second physical unit.

### BLOCKER

- **B-01 — GitHub write credential missing (re-confirmed).** `git push --dry-run origin main` fails
  today with `fatal: could not read Username for 'https://github.com': No such device or address`;
  `gh` is not installed; `GITHUB_TOKEN` is not set; no credential helper is configured. Consequence:
  the seven issues were not created and the two documentation commits remain unpushed
  (`origin/main` = `c6cb443`). Remedy: `gh auth login` or export a token with issue write permission,
  then run `scripts/create-issues.sh` and `git push origin main`. The dry run lists exactly the seven
  issues it will create.
- **B-02 — PlatformIO CLI missing (re-confirmed).** `command -v pio` returns nothing although the
  platform, framework and RISC-V toolchain caches exist under `~/.platformio`. `arduino-cli` 1.5.1
  cannot substitute (no indexes, download host unreachable). Consequence: Phase 1 cannot build.
  Remedy: install PlatformIO Core with user approval and network access.

## 8. Build and test results

- Builds: **none attempted.** No firmware exists; the toolchain is unavailable (B-02). Reference build
  artefacts dated 2026-11-24 (`firmware.bin`, 860 304 B) were observed but not rebuilt.
- Unit/integration tests: **none**, because no production code exists in this phase.
- Script validation: `bash -n` passed for both scripts; the issue creation dry run listed all seven
  issues without changing anything; the access verification script correctly reported the write
  blocker and exited non-zero.
- JSON validation: every JSON file in the repository parses (schema, examples, example config).
- Second-pass static checks: the tree is clean; the reference project reports zero porcelain lines;
  every tracked `*.json` parses; a regex scan for credential-like assignments in docs, scripts and
  examples found none. These are static checks only — no runtime, build or hardware test was added.

## 9. Security findings

| # | Finding | Severity | Action |
| --- | --- | --- | --- |
| S-01 | v2 event payloads contain high-risk fields (`input`, `content`, `text`, `reasoning`, `native`, `metadata`, `resources`, error bodies) | High if forwarded naively | Hard allowlist projection at the plugin boundary; explicit drop list in `docs/security.md`; capture test in Phase 5 |
| S-02 | The HTTP API is authenticated, so naive scripts fail rather than leaking | Informational | Use the plugin path; document it |
| S-03 | MCP server names can reveal internal tooling | Medium in shared spaces | Alias mode by default, opt-in real names |
| S-04 | Serial port is a single-owner resource; two bridges cannot share it | Medium (operational) | Detect port ownership and fail with an actionable message; never kill another process automatically |
| S-05 | Repository contains no secrets; `.gitignore` blocks env, keys, logs, captures | Verified | Keep; audit before each release |
| S-06 | Licence is the inherited MIT file from the initial commit | Governance | Final licensing decision requires explicit owner approval; unchanged in this phase |
| S-07 | No telemetry, no cloud dependency, no network listener beyond planned loopback | Verified by design | Enforce in review; assert bind address in tests |
| S-08 | CI uses `actions/checkout@v4`, a mutable tag rather than a commit SHA | Low (supply chain) | Phase 5 pins third-party actions to commit SHAs and records them; not changed here to avoid claiming a SHA that was not verified |

## 10. Known limitations

- No hardware was flashed or measured: no claim is made about frame rate, memory, touch behaviour or
  electrical margins.
- The protocol and its schema are a **design draft**; no code consumes them and Phase 2 must ratify
  them, including the 2048-byte and version-negotiation rules.
- Partial-refresh strategy and the exact animation performance are unproven on this panel.
- Quota and (conditionally) context percentage have no confirmed data source; the UI must show
  explicit unavailability.
- The seven issues exist only as files under `.github/issues/`; the remote has none (B-01).
- Plugin event delivery was not observed end to end (N-01). Everything about the event stream is
  schema- and documentation-verified, which is weaker than a live capture.
- The `state` size figures are arithmetic on the specified fields, not bytes measured from an encoder
  (A-08). The 2048 B cap has therefore been checked on paper, not against a real serializer.
- The design documents were corrected in four places during the second pass. Those corrections are
  design decisions reviewed against the installed API, not runtime findings.

## 11. Remaining tasks to close Phase 0 administratively

1. Provide GitHub write access, then run `scripts/create-issues.sh` and push `main`.
2. Approve or change the inherited MIT licence.
3. Approve installation of PlatformIO Core for Phase 1.

## 12. Git and issue references

- Commit `c6cb443` — `Initial commit`; this is what `origin/main` points at.
- Commit `f7bc964` — (`docs: add Phase 0 audit and project baseline`) on `main`, **local only**.
- Commit `9e656a0` — (`docs: record Phase 0 baseline commit reference`), **local only**.
- A further local commit records this verification pass (see the commit log; its hash is intentionally
  not written here, because embedding the hash of a commit inside that same commit is not possible).
- Issues: **none created**. Zero issues exist remotely; seven bodies are ready. No issue number is
  claimed because no remote write succeeded.

## 13. Recommendation for the next phase

Approve Phase 0 and proceed to Phase 1 in this order:

1. Unblock B-01 (GitHub credential) so the backlog and this baseline are visible to the team.
2. Unblock B-02 (PlatformIO Core) and build the untouched reference configuration first, to confirm
   the toolchain reproduces the known-good firmware before adding Buddy code.
3. Implement the firmware core with the verified pins, measure frame time and memory early, and only
   then invest in animation polish.
4. Obtain explicit approval before the first flash, with the reference firmware restore path tested.

The design is deliberately conservative: one event source, one protocol, one reducer, no invented
data. That is the shortest path to a reliable product rather than an impressive demo.

## 14. Second-pass review — defects found and resolved

This section exists because the first pass produced good documents with four internal contradictions
and one reducer defect. They were found by cross-checking the documents against each other and against
the installed schema, not by reading them again.

| # | Defect | Why it mattered | Resolution |
| --- | --- | --- | --- |
| D-01 | `docs/ui-design.md` specified **five** page-indicator dashes for **six** screens | The last screen would have had no position marker, and Phase 1 would have implemented the wrong count | One dash per implemented screen; dashes rather than digits to stay language-neutral |
| D-02 | `docs/security.md` allowlist omitted `notifications`, while the protocol, schema and example all carried it | A default-deny filter would have silently removed a field the Buddy screen needs; the bug would appear as "notification indicator never lights" | `notifications` added to the allowlist as a bounded `uint8` |
| D-03 | Screen 6 required bridge version, protocol version and diagnostics, but no document defined a single source of truth for them; the UI also asked for bridge uptime and a USB speed class that no field provides | Phase 1 would either invent values or leave the screen half-empty | `versions {fw,bridge,protocol}` and `diagnostic.code` added as optional `state` members with stated provenance; uptime and speed class removed as unmeasurable |
| D-04 | `docs/architecture.md` had no expiry rule for terminal states | A single `error` at 09:00 would outrank every later session until restart: the device would display a stale failure all day and stop being trustworthy | Terminal states are session-scoped notifications with TTLs (success 4 s, interrupted 10 s, error 30 s) or cleared by a new execution in the same session; permission prompts explicitly do **not** expire |
| D-05 | `protocol/protocol-v1.md` did not state that `ready` is the source of the bridge version, nor that `hello` is the source of the firmware/protocol pair | Version display would have been implemented ad hoc in firmware | Provenance documented in `ready` and `state`; handshake negotiates, the snapshot reports |

Two further findings changed the *implementation guidance* without changing a requirement:

- `mcp.status.changed` carries no status (V-15). The adapter must re-read `ctx.mcp.list()`. This is
  recorded as limitation L10 with a Phase 5 test.
- The riskiest data is in payload fields (`tool.input`, `tool.content`, `permission.resources`,
  structured error bodies), not in event names (V-16). The adapter must construct allowlisted objects
  rather than delete keys from raw events; `docs/opencode-api-audit.md` §3.2 now says so explicitly.

None of these corrections weakens a security control or changes a requirement. All are documentation
and design fixes made before any code exists, which is the cheapest possible time to make them.
