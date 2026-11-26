# Phase 4.1 — USB CDC regression investigation

Date: 2026-11-26
Status: investigation in progress. Phase 3.1 is the installed fallback; the bridge is LIVE.

## 1. Symptom

- Phase 4 (`741dcb5b…`) sends `hello` (164 B) and heartbeats after some cold boots, but never
  acknowledges `ready`/`config`; no device error/resync.
- A direct Python serial probe reproduces the missing ACK.
- Phase 3.1 (`280166…e12ad`) works with the same host, cable, port, bridge and procedure.
- The failure is intermittent across cold boots; it is not yet established whether bytes reach the
  ESP32, whether `Serial.read` is called, whether the parser rejects them, or whether the ACK is lost.

## 2. Hypotheses (to be tested, not assumed)

| ID | Hypothesis | Discriminating test |
| --- | --- | --- |
| H1 | The 164-byte Phase 4 hello (extra 24 B capability) perturbs the CDC endpoint/first packets | Minimal firmware M1 (140 B hello) vs M2 (164 B hello), same init |
| H2 | The initial dashboard render delays USB service long enough to lose the host writes | M3 adds the display + first render; measure interval between USB service calls |
| H3 | Instrumentation/toolchain difference: archived Phase 3.1 works but rebuilt Phase 3.1 fails | Rebuild `8bf3e08` with the current toolchain and test behavior |
| H4 | The host/bridge write pattern during boot leaves the CDC OUT endpoint stalled | Minimal firmware with host ready/config immediately vs delayed; RX counters |
| H5 | The RX queue allocation or USB CDC init is intermittent | Probe build counters `Serial.available`, bytes consumed, queue state |
| H6 | The failure is environmental/hardware (hub/port/cable), independent of image | Minimal firmware repeated boots; Phase 3.1 repeated boots |
| H7 | The parser/sequence rejects without an error | Probe counters: parser invocations/results/last type/seq |
| H8 | The ACK is generated but not transmitted | Probe counters: ACK queued/transmitted, TxBuffer saturation |

## 3. Experimental artifacts (to be built separately)

- `M1` minimal USB CDC, 140-byte hello, no display.
- `M2` minimal USB CDC, 164-byte hello, no display.
- `M3` M2 + display init + first Buddy render.
- `P` Phase 4 probe: RX/parser/TX counters, no arbitrary text in production NDJSON; read over a
  temporary diagnostic stream without the bridge.
- `R` Phase 3.1 rebuilt from `8bf3e08` with the current toolchain.

All experiment binaries are stored under `/tmp/opencode/phase41/` with SHA-256 and source revision.
The product release binary is preserved in `.backups/phase4-2026-11-26/`.

## 4. Baseline protocol

For each image, record:

- cold power-cycle (physical cable) vs software reset (`ESP.restart`) vs bridge restart vs USB
  reconnect;
- enumeration (lsusb device number), serial port open, first hello, capability, ready/config sent,
  first ACK, state sync, time to LIVE, reset reason, errors/resyncs;
- at least 3 cold boots per image before drawing a conclusion; repeat failures are reported, not
  discarded.

## 5. Controlled environment

Same ESP32-C3 (MAC `44:bd:8d:4e:27:a4`), same USB cable, same host port (bus 001, hub port 002), same
Linux host, 115200 8N1, bridge `1b43a6a`, esptool 5.7.0 `--no-stub`, application-only at `0x10000`.
The host cannot power-cycle the VMware virtual hub programmatically; physical unplug/replug is
requested from the Product Owner for cold boots. Software resets use a minimal `RESTART` command or
esptool `--after watchdog-reset`, and are recorded separately.

## 6. Source/toolchain comparison

Current toolchain: PlatformIO Core 6.2.0, platform `espressif32@6.5.0`, Arduino core
`2.0.14 (3.20014.231204)`, toolchain `riscv32-esp 8.4.0+2021r2-patch5`, LovyanGFX 1.2.21,
ArduinoJson 7.4.3.

Phase 3.1 source revision to rebuild: `8bf3e08` (last Phase 3.1 documentation commit; firmware source
is the Phase 3.1 tree). Phase 4 source: `c39b1fa` (release `741dcb5b…`). The archived binaries are
used for A/B; a rebuilt Phase 3.1 is the toolchain control.

## 7. Exit criteria

- Earliest image that reproduces the failure identified, or the mechanism localized to USB RX,
  serial consumption, framing, parser, handshake or TX.
- Smallest correction that preserves all Phase 4 features and protocol compatibility, with a
  regression test.
- 20 cold-boot handshakes, 10 software resets, 10 bridge restarts, 10 USB reconnects on the final
  candidate (or FAIL/PASS WITH RESERVATIONS with every failure recorded).
- One-hour soak on the final candidate; Phase 3.1 restored if the candidate is not reliable.

## 8. Outcome (2026-11-26)

The hypotheses were resolved by the experiments in
`docs/evidence/phase-4-1-usb-diagnostics.md` and `phase-4-1-ab-matrix.md`:

| ID | Disposition |
| --- | --- |
| H1 hello size | **PARTIAL** — the 164 B hello loses the boot race more often than 140 B, but is not a cause by itself (both images fail the esptool amplifier 0/10) |
| H2 render delay | **NOT SUPPORTED** — clean software restarts handshake 10/10 on Phase 4 |
| H3 toolchain | **NOT SUPPORTED** — the rebuilt Phase 3.1 has the archived size and behaves as the control |
| H4 host write pattern | **PARTIAL** — the no-host window lets the self-echo accumulate; the first write then meets the poisoned line |
| H5 RX init | **NOT SUPPORTED** — the RX path receives and consumes bytes; the parser sees the merged line |
| H6 environment | **PARTIAL** — the VMware virtual hub is a plausible contributor to the TX->RX fragment; the corrections are independent of it |
| H7 parser | **CONFIRMED** — the merged `ready` is `ParseError`, `config` is a `Gap`, no ACK is generated |
| H8 TX loss | **NOT SUPPORTED** — no ACK is queued because none is generated |

Root cause: a fragment of the device's own USB CDC transmission is delivered into its RX at cold
boot and prefixes the first host frame; while no host is connected those fragments also accumulate
in the line buffer. Corrections and remaining work: `docs/phase-4-1-report.md`.
