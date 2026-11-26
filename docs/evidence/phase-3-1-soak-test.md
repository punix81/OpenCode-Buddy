# Phase 3.1 — soak test

Status: **PASS** (61 min, no steady-state error, no resync).

## Parameters

| Item | Value |
| --- | --- |
| Firmware | Phase 3.1 release, sha256 `280166888f05871faa43da3c44c2f6fdf997c06efc6d19d86373d53bfe0e12ad` |
| Mode | **MOCK stress** (explicitly chosen to avoid DeepSeek cost); no LIVE data in this run |
| Bridge | `npm run mock -- --scenario stress --duration 3660000 --log-level info` |
| Duration | 3 660 s (61 min, ≥ 3 600 s required) |
| Start (UTC) | 2026-11-26 12:17:16 (third attempt) |
| Planned end (UTC) | 2026-11-26 13:18:16 |
| Log | `/tmp/opencode/soak-release-3.log` (local, not committed) |
| Resource sampler | every 30 s: RSS and `%CPU` of the bridge process |

The stress scenario exercises three sessions, continuous transitions, permissions, questions, retries,
compaction, MCP changes and maximum-length text.

## Defects found by the invalidated attempts

1. **First attempt (11:55:27 UTC, 2 min):** two `E_PARSE` + `resync` at 11:57:00. The bridge was
   sending state on every 100 ms tick while events arrived, instead of the configured 1 s cadence; the
   device RX queue overflowed while rendering. Fixed in `0d199ac` (respect `stateIntervalMs`, test
   "state frames are paced by stateIntervalMs during an event burst").
2. **Second attempt (11:59:16 UTC, ~18 min):** the stress adapter tied the session index and the phase
   to the same counter, so `permission.asked` and `permission.replied` (and question ask/reply) used
   different sessions. The permission stayed pending forever and the device displayed
   `permission_required` for the whole run (753 of 755 samples). Fixed in `4ffb144`: one 12-phase cycle
   stays on one session, resolves every interaction and every tool, and a late tool outcome cannot
   revive an idle session. The pure `stressEvents` test covers the cycle.

Neither attempt counts as a pass. The third attempt started with the corrected adapter and state
cadence; the first 12 s already rotated through thinking, working, generating, permission, user-input,
retrying, compacting, success and idle with 0 errors and 0 resyncs.

## Results

| Metric | Value |
| --- | --- |
| Duration | 3 660.4 s (12:17:16.559 → 13:18:16.984 UTC) |
| State frames sent | 3 647 (≈1 per second, the configured cadence) |
| MCP frames sent | 3 647 |
| Heartbeats sent | 1 825 |
| Device heartbeats received | 1 830 |
| Device ACKs received | 7 295 |
| ACK latency | average **65 ms**, max **490 ms**, 7 292 samples |
| Expired ACKs | **0** |
| Device errors (`device error`) | **0** in steady state |
| Invalid messages | **1**, at the first line of the run (12:17:16.956, buffered hello burst); no recurrence |
| Resynchronisations | **0** |
| Oversized lines | **0** |
| Bridge reconnects | **0** (`bridge status=ready` once) |
| Bridge RSS | 56 404 kB, **constant** across 122 samples |
| Bridge CPU | 0.0–0.1 % (`ps` lifetime average) |
| State coverage | compacting 295, generating 298, idle 301, permission 308, retrying 307, success 314, thinking 925, user-input 302, working 597 |
| TX drops / heap / FPS | measured in the diagnostic run (`phase-3-1-performance.md`) |

The single invalid message is a **startup artifact**: the device had buffered re-announcements while the
previous bridge was stopped, and one line arrived partial/merged at the first open. The bridge ignored
the duplicate hellos, sent one error frame, and never resynchronised; no error occurred during the
remaining 61 minutes. It is recorded as a limitation, not as a soak failure. It was addressed after the
soak by the handshake-ACK gate (`be2b803`): state/mcp are withheld until the device acknowledges
ready/config. Bridge restarts with the device already running are now clean (0 error, 0 resync).

The bridge was stopped by the duration timer; the summary above is its own counter set.
