# Phase 5 — test summary (Checkpoint B)

Date: 2026-11-27. Command: `scripts/qa.sh --coverage` (exit 0). Individual suites remain runnable.

| Suite | Result | Notes |
| --- | --- | --- |
| TypeScript typecheck | PASS | `tsc --noEmit`, strict, `noUncheckedIndexedAccess` |
| ESLint bridge + plugin | PASS | 0 errors; 6 dead-code findings fixed |
| Bridge | **124/124** | includes fuzz, IPC, registry, privacy, protocol |
| Coverage | **96.54 / 87.20 / 87.63** | lines / branches / functions |
| Plugin | **27/27** | +3 projection tests |
| Protocol validation | PASS | 12 valid / 14 invalid, examples verified |
| Firmware host | PASS | protocol, localization, gestures, TX |
| Firmware fuzz | PASS | 10 000 cases under ASan/UBSan |
| Number formatting | PASS | 19 boundaries |
| Simulator `all-states` | PASS | MOCK, no device |
| Preview | **8/8** | 288-image equivalence: 0 differing pixels |
| Firmware RC build | SUCCESS | `dd7d1d57…`, 413 344 B, 22 620 B RAM, 378 782 B flash |
| Diagnostic LIVE build | SUCCESS | `3646d4ce…`, 415 408 B (not installed) |

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
