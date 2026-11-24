# CI workflows

Current workflows:

| File | Purpose | Verified |
| --- | --- | --- |
| `validate-json.yml` | Parse every protocol schema/example and `config.example.json` on change. | NOT VERIFIED — added in Phase 0, never executed on GitHub (no write access at the time). |

Planned, added with the code they test:

- Phase 1: firmware build (PlatformIO cache, pinned platform).
- Phase 2: bridge lint, typecheck, unit and integration tests; protocol schema tests.
- Phase 3: plugin typecheck against a pinned `@opencode/plugin` version.
- Phase 5: privacy capture test, fuzz smoke run, dependency audit, SBOM generation.
- Phase 6: release packaging with checksums.

CI must never require secrets for the core test suite, and must never run against a real device.
