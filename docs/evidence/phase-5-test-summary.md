# Phase 5 — test summary (Checkpoint B)

Date: 2026-11-27. Command: `scripts/qa.sh --coverage` (exit 0). Individual suites remain runnable.

| Suite | Result | Notes |
| --- | --- | --- |
| TypeScript typecheck | PASS | `tsc --noEmit`, strict, `noUncheckedIndexedAccess` |
| ESLint bridge + plugin | PASS | 0 errors; 6 dead-code findings fixed |
| Bridge | **126/126** | includes fuzz, IPC, registry, privacy, protocol, BUDDY-DIAG filter |
| Coverage | **96.61 / 87.31 / 87.63** | lines / branches / functions |
| Plugin | **27/27** | +3 projection tests |
| Protocol validation | PASS | 12 valid / 14 invalid, examples verified |
| Firmware host | PASS | protocol, localization, gestures, TX |
| Firmware fuzz | PASS | 10 000 cases under ASan/UBSan |
| Number formatting | PASS | 19 boundaries |
| Simulator `all-states` | PASS | MOCK, no device |
| Preview | **8/8** | 288-image equivalence: 0 differing pixels |
| Firmware RC build | SUCCESS | RC1 `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash (stable candidate) |
| Diagnostic LIVE build | SUCCESS | `3646d4ce…`, 415 408 B (campaign; rolled back) |

Run alone:

```sh
cd bridge && npm run typecheck
cd bridge && npm run lint
cd bridge && npm test
cd bridge && npm run test:plugin
cd bridge && npm run validate:protocol
bash firmware/test/host/run.sh
cd tools/ui-preview && python3 -m unittest -q test_preview.py
cd bridge && npm run simulate -- --scenario all-states --duration 5000
```

No hardware test is claimed in this table. The RC is not flashed; the six-screen panel check, cold
boots, USB reconnections and the soak remain Checkpoint D gates.

## 2026-11-27 closure

Phase 5 is **SOFTWARE ACCEPTED — HARDWARE VALIDATION DEFERRED**. The final RC was not flashed; the
hardware gates (cold boots, USB reconnections, six-screen/performance matrix, 3600 s soak, 28 800 s
endurance) move to Phase 6 on a native physical host. No hardware PASS is claimed.

## 2026-11-27 diagnostic campaign

The bridge suite grew to **126/126** (BUDDY-DIAG telemetry filter, safe-integer counters); the
tick-table check was added to QA. The diagnostic flashes and their read-backs are recorded in
`docs/evidence/phase-5-usb-diagnostics.md`. No final RC was flashed; the USB CDC RX stall after a
watchdog/flash reset remains open, so no hardware PASS is claimed.
