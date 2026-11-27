# OpenCode Buddy — security review

Date: 2026-11-27 (Phase 5, baseline `36cf097`)
Result: **no P0 finding.** One P1 reliability defect (error storm after an oversized line) and the
P2 findings of `docs/audit-phase-5.md` were corrected with regression tests. Two items stay open and
are release gates: the first-open USB handshake (P5-00) and dependency advisory data (unavailable).

## 1. IPC — plugin to bridge

- Directory: `0700`, created if absent, `lstat` refuses a symlink, ownership checked against the
  current uid; `chmod 0700` on every start.
- Socket: `0600`, refuses to unlink a non-socket path, stale socket removed only after the lock.
- Token: 32 random bytes hex (256 bits), 0600 file created with `wx`, regenerated per run, removed on
  stop; compared with `timingSafeEqual` after a length check.
- Lock: atomic `wx` create with the PID, `kill(pid,0)` liveness check, stale-lock removal with a
  single retry; the preflight check prevents a second CLI from resetting the device before it learns
  the port is owned.
- Peer limits: max 8 connections, hello within 2 s, 200 lines/s with a burst of 400, 8192-byte line,
  4×line buffer cap.
- The token is local-only; no network listener is created.

Verification: `bridge/test/ipc.test.ts` (token, no-hello, permissions, non-socket, stale lock,
disconnect ownership, version agreement, future timestamps, session caps), `paths.test.ts`, the
10 000-case IPC fuzz in `fuzz.test.ts`.

## 2. Serial and firmware

- The bridge never opens a port it did not identify by VID/PID `303a:1001`; `lock: true` and the
  bridge lock keep two processes apart.
- Frames are capped at 2048 B including the newline; the framer discards an oversized line up to the
  next newline and reports it once (P1-01 fixed).
- The firmware parser validates JSON depth, version, type, sequence and every field; a rejected line
  never changes the state; unknown fields reject the message.
- The 10 000-case C++ fuzz runs under ASan/UBSan (invalid UTF-8, NULs, truncation, deep nesting,
  self-echo prefixes) and a clean session is applied after the corpus.
- The touch path produces only `interaction` frames; the bridge logs them. There is no command,
  permission approval or question answer from the device.

## 3. Privacy projection

- Double allowlist (plugin projection + bridge `PrivacyFilter` + firmware `onlyKeys`).
- No prompt, code, tool argument/output, command, path, credential or token field exists in the wire
  schema; the projection tests assert that injected unknown fields are dropped.
- Logs are sanitized; the plugin debug file is opt-in, 0600, 1 MiB.
- MCP real names are opt-in and truncated; the default is stable aliases.

## 4. Findings disposition

| Finding | Severity | State |
| --- | --- | --- |
| P1-01 framer overflow reported on every chunk | P1 | fixed `bb5c527`, tests |
| P2-01 registry unbounded with pending prompts | P2 | fixed `99de977`, hard 256 + test |
| P2-02 future event timestamps | P2 | fixed `99de977`, clamp + test |
| P2-03 char-vs-byte display strings | P2 | fixed `99de977`, UTF-8/Latin-1 + tests + spec |
| P2-06 snapshot blocked up to 27 s | P2 | fixed `aac8a35`, parallel + bounded |
| P2-07 MCP online > total | P2 | fixed `99de977`, test |
| P2-08 running session evicted first | P2 | fixed `99de977`, test |
| P2-04/05 rendering cost | P2 | open, planned P5-02 (measurement requires a flash) |
| P3-01 MCP unknown as 0/0 | P3 | open, documented |
| P3-02 hello not retried immediately | P3 | open, bridge replay covers it |
| P3-03 lint/coverage/QA | P3 | QA script + coverage done; lint open (P5-07) |
| P3-04 performance evidence | P3 | open, P5-02 procedure |
| P3-05 alias truncation | P3 | documented |
| P3-06 doc drift | P3 | fixed by the 4.1/5 docs pass |

## 5. Open items and release gates

1. **P5-00 first-open handshake** — the installed 4.1 image lost the first handshake after the
   bridge opened the port (3 retries unanswered, reopen recovered). Diagnostic flash and correction
   pending; no release until a 20-cold-boot series passes.
2. **Dependency advisories** — `npm audit` cannot authenticate to the corporate registry's advisory
   endpoint. Status is **NOT VERIFIED**, not "zero vulnerabilities".
3. **Windows named pipes** — Phase 6; the current socket path is POSIX.
4. **Lint/format** — no ESLint/Prettier configuration yet; the QA script covers typecheck, tests,
   protocol, firmware host, fuzz and preview.

## 6. Commands

```sh
scripts/qa.sh                  # typecheck, tests, protocol, host, preview
scripts/qa.sh --coverage       # plus line/branch coverage
cd bridge && npm test          # 113 tests
cd bridge && npm run test:plugin
cd bridge && npm run validate:protocol
bash firmware/test/host/run.sh # 4 suites + 10 000-case fuzz
```

The current bridge coverage is 96.62 % lines / 87.17 % branches / 86.99 % functions.

## 7. Phase 6 Checkpoint A security review (2026-11-27)

- Windows Named Pipes reuse the shared authentication, rate limit, peer ownership and lock logic.
  The pipe name is per-user/derived, the token is 256-bit and the runtime descriptor is 0600 where
  supported; `icacls` is best effort. **Native Windows DACL/pipe verification is still required**
  (Checkpoint B); this review is not a native claim.
- The plugin installer edits only the plugin array, is dry-run by default, validates JSON/JSONC,
  makes a timestamped backup before `--apply` and removes only Buddy on uninstall. Tests use
  isolated fixtures; the real global configuration was not modified.
- Startup definitions are generated to an explicit output and never enabled or registered in
  development. No elevation or visible console is required.
- The portable package contains compiled JavaScript and runtime-only prebuilds, no compiler; the
  archive checksum and SBOM are generated locally. The Windows installer is unsigned and is not
  validated in this VM.
- No firmware flash occurs in Checkpoint A. The RC1 manifest verifier only reads/hashes and prints a
  plan; the RC1 and Phase 4.1 images are preserved.
- Vulnerability databases remain unavailable (`npm audit` authentication); status is **NOT
  VERIFIED**, not zero.
