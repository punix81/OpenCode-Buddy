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
