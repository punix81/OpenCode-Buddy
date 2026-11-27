# Phase 6 Checkpoint A — evidence (2026-11-27)

All results below were produced in this session on the Ubuntu audit host. Nothing here is a hardware,
Windows or native-installation validation. No serial port was opened, no flash was performed and no
GitHub operation was executed.

## 1. Quality gate

Command: `./scripts/qa.sh --coverage --firmware`

| Gate | Result |
| --- | --- |
| `tsc -p tsconfig.json --noEmit` | PASS |
| ESLint (bridge, plugin, `.mjs` syntax) | PASS |
| Bridge tests | 139 / 139 PASS |
| Bridge coverage | 96.55 % lines, 86.42 % branches, 88.29 % functions |
| Plugin tests | 30 / 30 PASS |
| Script tests | 14 / 14 PASS |
| Protocol validation | PASS |
| Firmware host tests | PASS |
| Preview build + tick tables | PASS |
| Preview tests | 8 / 8 PASS |
| Firmware release build | PASS — RAM 22 620 B, flash 378 782 B |
| Overall | `QA PASS (coverage=1 firmware=1)` |

The firmware release build produced `.pio/build/supermini/firmware.bin` with
`sha256 f9cc72eeb7b9f424ebb052c488e0d8d6e52a50fe4993d1279d214e42b2292ec8` (413 344 B). This is the
Phase 5 code-identical rebuild digest: the firmware source is unchanged by Checkpoint A. RC1
`dd7d1d57…` remains the frozen release candidate; the different digest is the known embedded ELF
SHA/validation-hash difference.

## 2. Individual suites

| Command | Result |
| --- | --- |
| `node --test scripts/test/autostart.test.mjs` | 4 / 4 PASS (Linux unit, hidden Windows script, explicit `--apply` output, refusal without output) |
| `node --test scripts/test/firmware-verify.test.mjs` | 3 / 3 PASS (match, modified image, non-app-only manifest) |
| `node --test scripts/test/plugin-install.test.mjs` | 6 / 6 PASS (dry-run, backup, duplicate, uninstall, JSONC preservation) |
| `node --test scripts/test/supervisor.test.mjs` | 1 / 1 PASS (bounded exponential backoff) |
| `node --test bridge/test/ipc-platform.test.ts` (via npm test) | included in 139 / 139 |
| `node --test plugin/opencode-buddy/*.test.mjs` | 30 / 30 PASS |

## 3. Frozen firmware verification (read-only)

```text
$ node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json \
    --image .backups/phase5-rc-2026-11-27/firmware-rc-dd7d1d57.bin --plan
OK   Phase 5 RC1 (frozen)
sha256=dd7d1d5727ae1e36e0a799fe248ea42f66d831593e5f0a5538b2196b287cce63
size=413344
offset=0x10000 app_only=true
FLASH PLAN (requires explicit Product Owner approval; not executed)
```

The plan was printed only; `esptool` was not invoked and no port was opened.

## 4. Portable package (Linux build host)

```text
$ node scripts/package-portable.mjs --out /tmp/opencode/p6-final
...
stage=/tmp/opencode/p6-final/opencode-buddy-0.2.0-linux-x64 bytes=3184881
archive=/tmp/opencode/p6-final/opencode-buddy-0.2.0-linux-x64.tar.gz
sha256=a2387b7aabc08cf8f9baac338b5ad8a36e8ff6c2f8c5940505fba6935321eb22
```

Archive size 1 047 705 B. `npm ci --omit=dev --ignore-scripts` added 21 runtime packages; no
compiler is required at user installation. The staged tree contains the compiled bridge, the plugin,
the scripts, the licence/notices, the SBOM, the RC1 manifest and the prepared Windows wrapper.
The archive and checksum live under `/tmp` and are not committed; the build is reproducible with the
commands in `docs/installation.md`.

## 5. Isolated installation demonstration

Fixture project `opencode.jsonc` containing a comment, an unrelated MCP server and an empty plugin
array. The real OpenCode user configuration was not read or modified.

| Step | Result |
| --- | --- |
| `install.mjs --prefix <tmp> --plugin-project <tmp>` (no `--apply`) | dry-run, prefix not created, change printed |
| `install.mjs ... --apply` | exit 0; app tree copied; launcher created; backup written; plugin entry added |
| `node dist/cli/simulate.js --scenario all-states --duration 1000` from the installed tree | exit 0; MOCK state frames emitted and acknowledged by the simulator |
| `install.mjs ... --uninstall --apply` | exit 0; prefix removed; only the Buddy entry removed; comment and MCP server preserved |

Backups remain next to the fixture configuration as timestamped `.bak-…` files. The demonstration is
AUTOMATED on Linux; it is not a Windows or physical-device test.

## 6. Status classification

| Claim | Class |
| --- | --- |
| Linux bridge/plugin/config/IPC/discovery/scripts tests pass | VERIFIED (this session) |
| Portable tree builds and installs on Linux from a fixture | VERIFIED (this session) |
| Firmware source unchanged; rebuild digest `f9cc72ee…` | VERIFIED (this session) |
| RC1 manifest matches the preserved image | VERIFIED (this session) |
| Windows Named Pipe listen/connect, DACL, COM discovery | NOT VERIFIED — AUTOMATED/MOCK only |
| Windows installer build/run | NOT VERIFIED — not built on Windows |
| Native Linux physical installation | NOT VERIFIED — Checkpoint B |
| Hardware, cold boots, USB reconnections, soak, endurance | NOT VERIFIED — Checkpoints B/C/D |
| Vulnerability status | NOT VERIFIED — advisory endpoint unavailable; not "zero" |
