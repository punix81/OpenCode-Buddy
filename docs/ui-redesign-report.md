# Embedded display redesign review

## Review artifacts

**VERIFIED** — [before and after](design/previews/comparison.png), [twelve expressions](design/previews/expressions.png), [six pages](design/previews/screens.png) and [interactive mock preview](../tools/ui-preview/README.md). The comparison uses the earlier renderer at f3a0406 and the redesigned renderer with the same model, agent, token counts and expression. These are native-size software captures.

## Changes and decisions

**VERIFIED** — BuddyFace draws two independent lenses in a common visor. Theme owns the startup palette and text fitting. Dashboard composes the six pages. ScreenManager retains gesture routing, frame scheduling, NVS integration and push instrumentation. AnimationEngine derives the current pose from time and state entry. See the [visual audit](design/ui-audit.md), [design system](design/design-system.md), [expression table](design/buddy-expressions.md), [dashboard semantics](design/dashboard-layouts.md) and [motion guide](design/animation-guidelines.md).

**VERIFIED** — the parser retains field presence for elapsed time, tokens, categories and counters. It preserves device-owned firmware version and keeps MCP alias detail while aggregate and source agree. StateManager remembers the last reported expression across local terminal expiry. Identical snapshots cannot replay a celebration. No wire keys were added. Config source and snapshot source can both identify mock data.

**VERIFIED** — the six-view review uses the actual C++ sprite backend with synthetic data. Angular token segments represent input/output shares. The session hand represents activity. All six pages use the dark palette. The preview also offers a light viewing surround.

## Release build

**VERIFIED this session** — clean PlatformIO release builds of the local starting revision and final source using the pinned supermini configuration. The Phase 2 handover records an earlier image at 372,250 B flash / 20,420 B static RAM. Local development continued after that report.

| Build | Flash usage | Static RAM |
|---|---:|---:|
| Local baseline f3a0406 | 372,588 B | 20,436 B |
| Redesign | 371,804 B | 20,516 B |
| Difference | −784 B | +80 B |

**VERIFIED** — firmware.bin is 405,712 bytes, SHA-256
`53b23f40d2d5822f6ddccf9fee5dee9d0eaf7c490d5ad1bbc7db298add81ccd9`.
The build produced zero Buddy source warnings and one warning in the pinned Arduino UART core. The sprite pixel plane remains 48,400 B. Palette payload is another 768 B of runtime allocation. Static RAM totals exclude allocations at startup.

## Validation record

| Check run locally | Classification and result |
|---|---|
| PlatformIO clean and release compilation | VERIFIED success |
| Firmware parser and shared message vectors | VERIFIED pass, including partial and maximum counters, snapshot replacement, expiry and re-entry |
| Firmware recognizer with mock GPIO | VERIFIED single, double, long and exclusive very-long pass |
| Bridge TypeScript typecheck and automated tests | VERIFIED zero diagnostics, 36/36 tests |
| Protocol validator | VERIFIED 11 valid and 13 invalid vectors, examples verified |
| Bridge in-memory simulator | VERIFIED all-states scenario ran for 20 seconds and emitted labelled mock states |
| Native preview tests | VERIFIED 4 test groups, including 88 screen/state/profile safe-disc cases, distinguishable face pixels, quiet stability, transition frames and missing/extreme data |
| Browser review | VERIFIED Chrome displayed firmware pixels. Short, double, long, very long, idle return and simulated permission on another page passed. |
| Serial and hardware scope | VERIFIED the RX queue setting, frame writer, panel configuration, rotation and bridge source match the starting revision |

## ESP32-C3 installation

**VERIFIED** — the Product Owner authorized installation of the release image from commit `1499c73`. Before writing, the full 4 MiB backup matched the digest computed by the device. The partition table and boot selection matched the app at `0x10000`. Only that application was written. Its on-device digest matched all 405,712 bytes of the reviewed binary.

**VERIFIED** — after a watchdog reset, the device sent an NDJSON v1 `hello` over USB identifying itself as OpenCode Buddy firmware `0.2.0`.

**NOT VERIFIED** for this image — sustained bidirectional USB traffic, one-hour stability, active FPS, frame time, minimum heap, first-frame and transfer latency, panel color separation, touch through PLA and readability at 40–60 cm. These checks remain Phase 2 work.
