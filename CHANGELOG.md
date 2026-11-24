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

### Not yet implemented

- Firmware, bridge, plugin, simulator: intentionally untouched in Phase 0.
