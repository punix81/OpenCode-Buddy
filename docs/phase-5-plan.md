# Phase 5 — plan (quality, security, performance, release hardening)

Date: 2026-11-27
Owner authorization: Phase 5 granted. No Phase 6, no GitHub operation, no firmware flash without
explicit approval.

## 1. Verified baseline (2026-11-27)

| Item | Value |
| --- | --- |
| HEAD | `36cf097` (after the Phase 4.1 docs; `58bd386` is the latest code+docs baseline named in the brief) |
| Phase 4.1 fixes | `a68fc1f` (parser resync + RX hygiene), `2509de8` (handshake replay) |
| Earlier corrections | `e800aae` (MCP stagger), `1b43a6a` (USB backlog) — both present |
| Firmware artifact | `2ff67b71…` 411 232 B, 22 604 B RAM, 376 734 B flash |
| Installed image | same artifact, to be re-verified read-only before P5-00 acceptance |
| Device | present (`303a:1001`, `/dev/ttyACM0`) at 08:38 |
| Typecheck | PASS |
| Bridge tests | **103/103** |
| Plugin tests | **24/24** |
| Protocol | 12 valid / 14 invalid, examples PASS |
| Firmware host | protocol, localization, gestures, TX — 4/4 PASS |
| Preview | **8/8** |

No contradiction with the brief. Deviations: HEAD is `36cf097`, not `58bd386` (two documentation
commits followed); the firmware artifact is unchanged.

## 2. P5-00 clarification — "0/5 on the final image with bridge"

**The five cold boots were not executed.** After the RX-hygiene fix the Product Owner stopped the
hardware session ("on arrête"), so no unplug/replug cycle was run on image `2ff67b71…` with the
production bridge. The phrase in the Phase 4.1 report means "0 of the planned 5", not "5 failures".

What *was* executed:

| Item | Image | Result |
| --- | --- | --- |
| Cold boots with the probe build (counters) | probe `26ebecfa…` = 4.1 code + instrumentation | 4/4 handshakes, `framing=1` each |
| Real-bridge cold boot | previous candidate `ed350f28…` (parser fix only) | 1/1 reproduced the field failure: no ACK, retries unanswered, reopen recovered |
| Real-bridge cold boots | final `2ff67b71…` | **0 executed** |
| Software restarts (bench build) | Phase 4 lab `85a9c981…` | 10/10 |
| Bridge-like 15 s absence | `ed350f28…` and `2ff67b71…` | 5/5 each |

Consequence: the final image's physical cold-boot series, the reboot/reconnect series and the soak
are the first work of P5-00. They require the Product Owner for unplug/replug cycles; the soak and
the local restart cycles can run autonomously.

## 3. Work breakdown

| Id | Work | Owner involvement | Output |
| --- | --- | --- | --- |
| P5-00 | 20 cold boots, 10 software reboots, 10 bridge restarts, 10 USB reconnects, delayed start, device-after-bridge, six screens ×3 languages, gestures, preferences, 3600 s soak | physical cycles; visual confirmation | `docs/evidence/phase-5-hardware-validation.md`, `phase-5-endurance.md` (soak part) |
| P5-01 | full audit, findings P0–P3 | none | `docs/audit-phase-5.md` |
| P5-02 | measure then optimize rendering; preserve design | none (host preview), hardware measurement on the installed diagnostic image later | `docs/evidence/phase-5-performance.md` |
| P5-03 | threat model, privacy, security review | none | `docs/security/*.md` |
| P5-04 | protocol robustness and fuzz/property tests | none | fuzz suites, `phase-5-fuzzing.md` |
| P5-05 | OpenCode integration robustness | possible harmless permission/question test | evidence section |
| P5-06 | numerical limits and metric correctness | none | tests + report section |
| P5-07 | quality gates, coverage, single command | none | `scripts/qa.sh`, `phase-5-coverage.md` |
| P5-08 | dependencies, licenses, SBOM, reproducibility | none (offline limits documented) | `dependencies.md`, `licenses.md`, `build-reproducibility.md` |
| P5-09 | local CI pipeline config | none (no remote run) | workflow + local run report |
| P5-10 | Release Candidate build + gate package | approval request only | RC summary, hashes, previews |
| P5-11 | flash + physical validation of the RC | explicit flash approval + cycles | `phase-5-hardware-validation.md` |
| P5-12 | 28800 s endurance | none (MOCK) | `phase-5-endurance.md` |
| P5-13 | documentation, handover, release prep | none | docs + local commits |

## 4. Order and checkpoints

- **Checkpoint A** (now): baseline verified; plan written; audit complete; P5-00 hardware series
  started/queued with the owner; soak harness prepared.
- **Checkpoint B**: P0/P1 fixes, rendering optimization, fuzz + quality gates, dependency audit.
- **Checkpoint C**: RC build, previews, software validation, flash authorization request.
- **Checkpoint D** (after approval): flash, physical validation, 8 h endurance, LIVE restore, final
  report.

## 5. P5-00 acceptance protocol

Durable harnesses live in `tools/qa/` (committed):

- `cold_boot.py` — records one handshake per new USB enumeration, prints every line, writes JSONL.
- `soak.py` — MOCK stress for N seconds with periodic metrics and a JSONL summary.
- `qa.sh` — the single local quality-gate command (P5-07).

Cold-boot criteria (each cycle): new USB device number, `hello`, ACK 1/2 within 5 s, state frame
within 2 s, no reopen, no device error, no resync. Every attempt is recorded, failures included.
Software reboots use esptool `--after watchdog-reset` (a CPU reset, not a flash; explicitly not a
cold boot). Bridge restarts kill and restart the process between cycles. USB reconnects need a
physical unplug (owner). The delayed bridge start opens the port 60 s after the device boots.

## 6. Constraints

Local only; no GitHub; no flash without approval; no Phase 6; preserve wiring, GPIO, rotation, design,
six screens, twelve states, EN/FR/DE, four gestures, device-owned preferences, protocol compatibility
and privacy; no new cloud/telemetry/Wi-Fi/Bluetooth; do not modify Codex Quota Mini or the global
OpenCode configuration; synthetic secrets/paths only in tests.
