# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from its first release.

## [Unreleased]

### Added — Phase 0 (technical audit and initialization)

- Repository documentation scaffold: README, AGENTS, CONTRIBUTING, SECURITY, changelog, editor and
  attribute configuration.
- `docs/requirements.md`, `docs/architecture.md`, `docs/ui-design.md`, `docs/security.md`,
  `docs/roadmap.md`, `docs/installation.md`, `docs/troubleshooting.md`.
- `docs/hardware-audit.md`: verified GPIO map, display configuration and toolchain from the
  pre-existing reference firmware, plus identified electrical and coexistence risks.
- `docs/opencode-api-audit.md`: OpenCode 2.4.1 plugin/event/API audit with the observability matrix
  and documented limitations.
- `protocol/protocol-v1.md` and draft JSON Schema for the USB NDJSON protocol (design only, no
  implementation).
- Phase issue definitions and reproducible GitHub issue creation script.
- `docs/phase-0-report.md` with findings classified as VERIFIED / ASSUMPTION / NOT VERIFIED /
  BLOCKER.

### Changed — Phase 0 second verification pass

- `docs/opencode-api-audit.md`: added payload-level facts for the eleven highest-value v2 events, the
  privacy consequence, the re-verification evidence, and limitation L10 (`mcp.status.changed` carries
  no status).
- `docs/architecture.md`: terminal states are now session-scoped notifications with a bounded TTL, so
  a stale failure cannot mask live activity forever.
- `docs/security.md`: added `notifications` to the allowlist and stated the provenance of `versions`
  and `diagnostic.code`.
- `docs/ui-design.md`: corrected the page-indicator count to six; removed the unmeasurable USB speed
  class and the unsourced bridge uptime row; documented version sources.
- `protocol/protocol-v1.md`, `protocol/schemas/protocol-v1.schema.json`, `protocol/examples/state.json`:
  optional `versions` and `diagnostic` in the `state` snapshot, with a corrected size budget.
- `docs/phase-0-report.md`: current Git/remote facts, second-pass evidence, findings V-12–V-18,
  assumptions A-07–A-08, and §14 listing the five design defects found and resolved.

### Not yet implemented

- Firmware, bridge, plugin, simulator: intentionally untouched in Phase 0.
