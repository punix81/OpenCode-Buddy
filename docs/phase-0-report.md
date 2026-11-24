# Phase 0 report — Technical audit and initialization

Date: 2026-11-24
Repository: `punix81/OpenCode-Buddy` (branch `main`)
Status: **Phase 0 complete; awaiting architectural review and approval.**
Nothing was flashed, installed, rebuilt or pushed. No existing configuration was modified.

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

1. Inspected the repository, its Git state, remote and history (single `Initial commit`).
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

### ASSUMPTION

- **A-01** `form.created` is the user-question flow that should raise `user_input_required` (Phase 3
  must confirm with a real question).
- **A-02** `session.usage.updated` reports cumulative per-session usage, so the reducer must take the
  maximum rather than sum deltas (Phase 3).
- **A-03** Context percentage is computable from a model context limit and session tokens; if the
  denominator is unstable, the screen must show "unavailable".
- **A-04** GPIO0 as display reset does not disturb boot strapping on this unit (reference works).
- **A-05** The 27 MHz SPI clock supports 20–30 FPS with partial refresh; needs measurement.
- **A-06** `serialport` is a suitable USB library on Windows and Linux in enterprise images.

### NOT VERIFIED

- **N-01** End-to-end plugin event delivery on this machine (no plugin was loaded; no event captured).
- **N-02** Frame rate, memory high-water mark and brown-out margin on hardware.
- **N-03** The CI workflow was never executed on GitHub.
- **N-04** No build was performed: the firmware does not exist and PlatformIO is missing.
- **N-05** macOS behaviour.
- **N-06** Behaviour with a second physical unit.

### BLOCKER

- **B-01 — GitHub write credential missing.** `git push --dry-run` fails with
  `fatal: could not read Username for 'https://github.com'`; `gh` is not installed;
  `GITHUB_TOKEN` is not set. Consequence: the seven issues were not created and this work is not
  pushed. Remedy: `gh auth login` or export a token with issue write permission, then run
  `scripts/create-issues.sh`. The dry run lists exactly the seven issues it will create.
- **B-02 — PlatformIO CLI missing.** `pio` is not on `PATH` although platform and toolchain caches
  exist under `~/.platformio`. `arduino-cli` cannot substitute (no indexes, download host blocked).
  Consequence: Phase 1 cannot build. Remedy: install PlatformIO Core with user approval and network
  access.

## 8. Build and test results

- Builds: **none attempted.** No firmware exists; the toolchain is unavailable (B-02). Reference build
  artefacts dated 2026-11-24 (`firmware.bin`, 860 304 B) were observed but not rebuilt.
- Unit/integration tests: **none**, because no production code exists in this phase.
- Script validation: `bash -n` passed for both scripts; the issue creation dry run listed all seven
  issues without changing anything; the access verification script correctly reported the write
  blocker and exited non-zero.
- JSON validation: every JSON file in the repository parses (schema, examples, example config).

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

## 10. Known limitations

- No hardware was flashed or measured: no claim is made about frame rate, memory, touch behaviour or
  electrical margins.
- The protocol and its schema are a **design draft**; no code consumes them and Phase 2 must ratify
  them, including the 2048-byte and version-negotiation rules.
- Partial-refresh strategy and the exact animation performance are unproven on this panel.
- Quota and (conditionally) context percentage have no confirmed data source; the UI must show
  explicit unavailability.
- The seven issues exist only as files under `.github/issues/`; the remote has none (B-01).

## 11. Remaining tasks to close Phase 0 administratively

1. Provide GitHub write access, then run `scripts/create-issues.sh` and push the branch.
2. Approve or change the inherited MIT licence.
3. Approve installation of PlatformIO Core for Phase 1.

## 12. Git and issue references

- Commit: Phase 0 baseline `f7bc964` (`docs: add Phase 0 audit and project baseline`) on `main`,
  **local only — not pushed** because no write credential is available (B-01).
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
