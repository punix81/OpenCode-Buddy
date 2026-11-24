# Contributing to OpenCode Buddy

## Before you start

1. Read [AGENTS.md](AGENTS.md). It contains hard constraints (no unapproved flashing, no secrets, no
   reference-project edits), the verified hardware table and the GitHub ownership rule.
2. Read the current phase gate in [docs/roadmap.md](docs/roadmap.md).
3. Phase work is tracked by the Product Owner. Agents do not open, edit or query remote issues.

## Workflow

1. Work on the local repository. Local branches are allowed: `feat/<phase>-<short-topic>` or
   `fix/<topic>`.
2. Make one logical change. Keep firmware, bridge, plugin and protocol changes in separate commits
   when they do not depend on each other.
3. Update the documents the change affects in the same commit.
4. Run the checks listed below.
5. Report the change to the Product Owner with: intent, verified evidence (commands + result),
   privacy impact, and what is *not* covered. **Do not push and do not open a pull request.** The
   Product Owner handles remote publication.

## Checks

| Area | Command | Available from |
| --- | --- | --- |
| Bridge / plugin | `npm run lint && npm run typecheck && npm test` (per package) | Phase 2 |
| Firmware | `pio run -e buddy` | Phase 1 |
| Protocol | `npm run validate:protocol` (schemas + examples) | Phase 2 |
| Docs | Markdown link check in CI | Phase 5 |

Never report a check as passing unless the command actually ran and exited successfully in your
environment. If a tool is missing, say so.

## Privacy impact statement

Every pull request that touches data flow must answer:

- Which new fields leave the OpenCode process?
- Are they on the allowlist in [docs/security.md](docs/security.md)?
- Could any value contain prompts, responses, code, paths, credentials or personal data?
- Does the mock/simulator path clearly identify itself?

Pull requests that transmit unbounded or user-authored content are rejected.

## Commit messages

Conventional Commits:

```text
feat(bridge): aggregate tool counters across sessions
fix(firmware): avoid flicker on partial screen refresh
docs(protocol): clarify resync after sequence gap
```

Breaking protocol or configuration changes use `!` and a `BREAKING CHANGE:` footer.

## Code style

- TypeScript strict; no `any` in exported signatures; explicit return types on public functions.
- C++17, 2-space indent, `constexpr` for constants, no dynamic allocation in the render loop.
- Files are UTF-8, LF, final newline, no tabs (see `.editorconfig`).
- Naming follows the surrounding code; prefer clarity over cleverness.

## Reporting security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
