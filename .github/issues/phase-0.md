# Phase 0 — Hardware and OpenCode v2 compatibility audit

## Objective

Remove technical unknowns before implementation: establish the exact, proven hardware configuration, prove which OpenCode v2 signals are observable, and baseline the repository and its decisions.

## Technical scope

- Read-only audit of the pre-existing `Codex-Quota-Mini` reference project (pins, display driver, USB CDC, toolchain, libraries).
- Audit of the locally installed OpenCode v2: version, plugin SDK, client SDK, OpenAPI document, event inventory, MCP status surface.
- Requirements, architecture, UI/UX, security and protocol design baseline.
- Repository scaffold and phase backlog.

## Implementation checklist

- [x] Inspect repository and Git state; confirm origin and default branch.
- [x] Locate and inspect the reference project without modifying it.
- [x] Extract and cite GPIO assignments, display configuration and USB serial implementation.
- [x] Detect the physical device and its USB identity.
- [x] Record the installed OpenCode version, server status and API surface.
- [x] Inspect `@opencode/plugin` and `@opencode/client` typings pinned to the installed version.
- [x] Produce the observability matrix (event → requirement) and document gaps.
- [x] Write requirements, architecture, UI design, security design, roadmap, troubleshooting.
- [x] Draft protocol v1 and its JSON Schema.
- [x] Verify GitHub read access and record the write-access blocker.
- [x] Produce the Phase 0 report with classified findings.

## Dependencies

None. Blocks every other phase.

## Acceptance criteria

- Every required signal has a verified event source or a documented gap with a fallback.
- GPIO map is traceable to reference source lines, with no invented assignment.
- Blockers are named with the exact missing prerequisite.
- Architecture and security designs are approved by the user.

## Testing requirements

- No code tests in this phase. Verification is documentary and reproducible: commands and their outputs are recorded in the report.
- Classification of every finding as VERIFIED, ASSUMPTION, NOT VERIFIED or BLOCKER.

## Expected deliverables

- `docs/hardware-audit.md`, `docs/opencode-api-audit.md`, `docs/phase-0-report.md`.
- `docs/requirements.md`, `docs/architecture.md`, `docs/ui-design.md`, `docs/security.md`, `docs/roadmap.md`.
- `protocol/protocol-v1.md`, `protocol/schemas/protocol-v1.schema.json`, examples.
- Repository scaffold, contribution and security policies.
- Seven phase issues.

## Gate

User review and approval of the architecture, the hardware map, the protocol direction and the security model.
