# Phase 3 — OpenCode v2 integration

## Objective

Drive the companion from real OpenCode v2 activity with a native server plugin, without ever transmitting conversation content or blocking the agent loop.

## Technical scope

- `@opencode/plugin` server plugin pinned to the supported CLI minor.
- `ctx.event.subscribe` for live events; snapshot seeding through `session.list`, `permission.list`, `mcp.list`.
- Mapping per `docs/opencode-api-audit.md` §4 and §7.
- Concurrent sessions, deduplication, privacy gate, failure isolation.
- Empirical confirmation of the open questions: form semantics, usage cumulative vs delta, context denominator.

## Implementation checklist

- [ ] Implement plugin entry, lifecycle and options.
- [ ] Implement the event adapter and allowlist projection.
- [ ] Map execution, step, reasoning, generation, tool, retry, compaction, permission and form events.
- [ ] Seed state at startup and after bridge reconnect.
- [ ] Aggregate multiple sessions deterministically; break ties by session age.
- [ ] Confirm `form.created` semantics and implement `user_input_required` accordingly.
- [ ] Confirm `session.usage.updated` semantics and implement double-count protection.
- [ ] Implement context percentage only when a reliable denominator exists.
- [ ] Implement MCP status refresh and alias assignment.
- [ ] Harden: bounded queue, guarded handlers, backoff, no throws into OpenCode.
- [ ] Test with DeepSeek and at least one additional available provider.

## Dependencies

Phase 2 bridge endpoint and reducer. OpenCode v2 installed and configured.

## Acceptance criteria

- A real execution changes the companion state end to end.
- A permission request is displayed and cleared when answered in OpenCode.
- Success and failure are distinguishable; a tool failure alone does not raise `error`.
- Two concurrent sessions aggregate deterministically and do not double count tokens or tools.
- OpenCode latency is unchanged with the plugin loaded and the bridge absent.
- A capture test proves no prompt, response, code, path, tool argument or credential reaches the wire.

## Testing requirements

- Unit tests with recorded (sanitized) event sequences.
- Integration test against a real local server.
- Multi-session concurrency test.
- Privacy capture test with adversarial content.
- Manual scenarios: permission, question, retry, compaction, interrupt, provider error.

## Expected deliverables

- `plugin/` implementation with tests.
- Documented event mapping, including any correction to the Phase 0 audit.
- Empirical answers to the four open questions in `docs/architecture.md` §9.
- Updated protocol fields if a new signal is required (within v1 compatibility rules).
- Phase 3 report.

## Gate

Real-session demonstration with privacy evidence and an unchanged OpenCode experience.
