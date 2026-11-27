# Phase 4.1 — review of the USB corrections

Date: 2026-11-27. Scope: commits `a68fc1f` (parser recovery + RX drain) and `2509de8` (handshake
replay), reviewed against the installed image `2ff67b71…`. The review also covers the one weakness
found during this acceptance and corrected afterwards (`c4db0b3`, bridge only).

## 1. What was observed, and what remains an assumption

**Observed (VERIFIED)**: on this host, after a cold boot or a long no-host window, the ESP32-C3
receives short fragments of its **own** USB CDC transmission. The probe build logged, for four
physical cold boots:

```
BUDDY-PLINE ... head=BUDDY-PROBE ms=1mp{"v":     (fragment + ready)
BUDDY-PLINE ... head=mpty=0 partial=0,"dto":     (fragment + ready)
```

and `framing=1` on every boot. The host also saw a corrupted line (`invalid message code=E_PARSE`)
in the boot backlog. The fragments are 16–25 bytes, have no newline and may contain `{` and `"data"`.

**Not verified (ASSUMPTION)**: which layer produces the loopback. Candidates are the USB
Serial/JTAG peripheral, the Arduino `HWCDC` driver, or the VMware virtual USB hub. The corrections do
not depend on the answer; they make the parser and the link tolerant of the observed behaviour.

## 2. Checklist

| Requirement | Finding | Evidence |
| --- | --- | --- |
| Framing recovery cannot bypass validation | The recovered frame is re-parsed from the chosen offset and goes through the **unchanged** dispatch (version, type, sequence, `onlyKeys`, every field bound). The scan only runs after the whole line failed to deserialize. | `ProtocolParser::handleLine`, `findFrameStart`, `test_protocol.cpp` prefix cases, C++ fuzz |
| Valid-looking JSON inside a corrupted message cannot silently change state | A candidate is accepted only if the remainder is one complete JSON object **and** its type is a peer type; a nested object that is not a peer frame is skipped. A complete peer frame embedded in a corrupted line is applied only after full validation — that is the intended recovery, and the writer is the host (trust boundary). | `findFrameStart` (peer types), fuzz corpus |
| Candidate scanning is bounded | At most 4 `{` candidates within the first 192 bytes; the line is already capped at 2047 bytes; no unbounded loop or allocation. | `kFramingScanBytes`, `kFramingCandidates` |
| Invalid messages cannot alter the expected sequence | `lastPeerSeq_` is assigned only at the end of a successful dispatch. `ParseError`, `BoundsError`, `UnknownType` and `VersionError` return before it. `Gap` records a resync but does not advance. | `handleLine`, host tests, 10 000-case fuzz |
| RX cleanup cannot discard valid host data during enumeration | The drain runs while `HWCDC::operator bool()` is false (the host has not read any TX yet). The protocol has the host read `hello` before writing, so no legitimate host frame precedes the flag; a host writing before reading would lose its first frames by design. | `SerialManager::discardInput`, `main.cpp`, bridge handshake order |
| Handshake retries are safe after a partial acknowledgement | **Weakness found and fixed**: one ACK (ready) used to declare the handshake complete while `config` could be lost. The bridge now tracks the ready and config sequences of the current attempt and requires both ACKs; a missing one triggers the replay. | `c4db0b3`, `a partial handshake ACK does not release the snapshot` |
| Duplicate ready/config cannot reset valid preferences | `ready` resets the session's peer sequence and link flag; it never touches NVS. `config` applies the same values. The only local preference reset is the very-long press. | `ProtocolParser`, `PreferencesManager`, host tests |
| Replayed sequence numbers cannot corrupt an established session | `Duplicate` ACKs without applying; `Ignored` drops stale; `ready` seq 1 is the documented new-session marker. Replaying ready/config with the same values is idempotent. | bridge and host tests |
| Queues remain bounded | IPC 8 peers, 8 KB line, 4× buffer, 200/s burst 400; bridge pending ACKs 128; plugin queue 500; device RX 1024 B, TX 2048 B, line 2048 B; per-peer sessions 64 (hard 256 on the later branch); tool calls 512; interaction IDs 64. | constants and tests |
| No blocking operation was introduced | The corrections add no synchronous I/O on the hot path. `discardInput` is a non-blocking `Serial.available/read` drain; the parser scan is bounded; the bridge writes remain asynchronous. | code review |

## 3. The corrected weakness

Commit `c4db0b3` (bridge only): a partial ACK previously released the snapshot. The `config` frame
carries auto-return, gestures and an explicit language/quiet override; losing it while declaring the
handshake done would leave the device with stale defaults. The bridge now requires an ACK for
`ready` **and** `config` of the current attempt; a delayed ACK for a replay has the same sequence
and content, so it is valid. The regression test fails on the previous behaviour and passes now.

This fix was not part of the 30 hardware acceptance cycles (the device ACKed both frames in every
cycle). It is a review correction; the soak therefore ran on the pre-fix bridge for that path only.

## 4. Residual risk

- The first handshake after a long no-host uptime failed once during the earlier Phase 5 session
  (3 retries unanswered, reopen recovered). In this 4.1 acceptance session, the initial handshake,
  10 software resets, 10 bridge restarts, the delayed start and the soak start all passed on the
  first attempt. The boot-window condition is mitigated, not proven eliminated for every future
  cold boot; the skipped physical series is the missing evidence.
- The exact origin of the self-echo remains an assumption (Section 1). No change is made to the USB
  driver, the RX buffer size or the SPI clock.
