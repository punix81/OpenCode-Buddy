# Dashboard reading order

**VERIFIED** in Dashboard.cpp and the native pixel sheets.

| Page | First read | Supporting information |
|---|---|---|
| Buddy | Expression and state | Model, agent, source and page position |
| Session | Elapsed time from the latest snapshot | Model / agent, current phase, active session count. A moving tick shows activity. |
| Tokens | Decimal compact total | Blue input and lilac output segments show their relative shares. Context has its own numeric label. |
| Tools | Done, failed, running | Six separately labelled category bars scale to the largest observed count. The adjacent value carries the magnitude. |
| MCP Radar | Status markers on two orbits | Connected entries are round and on the inner orbit. Other classes use square markers on the outer orbit. An alias caption cycles through the supplied detail list. |
| System | USB host, bridge readiness, OpenCode availability | Device firmware, bridge version, protocol major and any diagnostic code |

**VERIFIED data rules.** A missing duration, counter, total or context value shows two dashes. Zero remains a number. Totals can be derived from two known components using a wide sum. Both operands and a nonzero sum are required for a colored token distribution. The MCP aggregate can exceed the eight aliases permitted in one detail frame. Its off count is total minus online and includes every non-connected class. Radar angles index the supplied list. System shows CDC host presence separately from protocol readiness. A disconnected dashboard with retained session data identifies the last snapshot.

**NOT VERIFIED** on hardware — small-label legibility in bright ambient light.
