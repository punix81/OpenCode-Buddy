# Phase 5 — Quality, privacy and stability

## Objective

Prove, with reproducible evidence, that OpenCode Buddy is safe for professional use and stable over a full working day.

## Technical scope

- Unit, integration, protocol, reducer, gesture and privacy tests; fuzzing.
- Disconnection storms, device resets, multi-session stress.
- Memory and performance analysis on hardware and bridge.
- Eight-hour hardware stability run.
- Dependency, licence and security audit; threat-model review.

## Implementation checklist

- [ ] Reach the agreed coverage on reducer, metrics and privacy filter.
- [ ] Table-driven reducer tests including concurrency and priority conflicts.
- [ ] Gesture tests: all timings, exclusivity, debounce, chatter.
- [ ] Privacy capture test with adversarial content; assert zero leakage.
- [ ] Fuzz firmware and bridge parsers; assert no reboot, no unbounded memory.
- [ ] Disconnect/reconnect storm (100 cycles) with state consistency checks.
- [ ] Multi-session stress (10 sessions, rapid phase changes).
- [ ] Bridge CPU/RSS profile; firmware heap high-water and frame-time profile.
- [ ] Eight-hour run with a scripted workload; log counters and errors.
- [ ] Dependency and licence audit with SBOM; advisory scan.
- [ ] Threat-model review against `docs/security.md` and close or accept each finding.

## Dependencies

Phases 1–4 complete. Physical hardware available.

## Acceptance criteria

- No sensitive field observed on the serial wire across all tests.
- No crash, leak, watchdog reset or display corruption in the eight-hour run.
- Memory returns to baseline after each disconnect cycle.
- All high-severity audit findings closed; residual risks documented and accepted.

## Testing requirements

All results reproducible from documented commands, with raw logs archived (sanitized) and summarised in the report.

## Expected deliverables

- Test suites and fixtures.
- Fuzz corpora (minimized, non-sensitive).
- Performance and stability report with charts or tables.
- Security audit and SBOM.
- Phase 5 report.

## Gate

Security and stability sign-off.
