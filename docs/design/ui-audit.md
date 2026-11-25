# Display audit and redesign plan

**VERIFIED** against the Phase 1 report, Phase 2 handover, USB evidence and renderer before editing.

| Previous behavior | Design decision |
|---|---|
| Small white ellipses inside a full bright ring. Floating symbols compete with the expression. | Use a pair of large luminous lenses, a common highlight, shaped lids and an interrupted peripheral track. |
| Repeated hard-coded palettes and fixed row ends. Footer badges sit outside the safe chord. | Share indexed colors, measured text fitting and a centered footer. |
| Grouped comma-separated totals, independently missing counts collapsed to zero. | Preserve field presence through the parser. Compact numbers and only draw ratios with both operands. |
| Tool values overlap bars, MCP aliases crowd the pager, bridge readiness is conveyed by color. | Dedicate separate areas to counters, activity, and explicit link labels. |
| Boot-relative motion repeats the success celebration. | Use state entry for one-shot motion and keep quiet frames stable. |

**VERIFIED historical baseline** — Phase 2 release 372,250 B flash and 20,420 B static RAM. Phase 1 active measurements were 25 FPS, 31.9 ms average, 33.1 ms maximum, 251,900 B minimum heap and approximately 324 ms to first frame. USB RX is 1024 B and writes are gated on complete-frame capacity.

**Design sequence** — render the same 220-square sprite on desktop and ESP32, inspect a native-size contact sheet, validate bounded layouts and field presence, build the release, then submit for visual review.

**NOT VERIFIED** — Phase 2 one-hour soak and device-side timing remain open. No pre-redesign panel photographs were found in the tracked project.
