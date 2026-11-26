# Dashboard reading order

**VERIFIED** in the Phase 4 renderer and the native 240×240 preview sheets (mock fixture), not yet on
the Phase 4 hardware image.

| Page | First read | Supporting information |
| --- | --- | --- |
| Buddy | Expression and state label | Model / agent, source footer (`LIVE`, `MOCK`, `OFFLINE`, `STALE`), quiet mode, notification count, page position. A permission or user-input count appears in the state label (`Permission (2)`). |
| Session | Elapsed execution time | Model / agent, current state (or interaction count), active session count. The chronometer runs only during an execution and freezes on its terminal value; idle reads `00:00`. |
| Tokens | `SESSION TOTAL` | Blue input and lilac output segments show their relative shares. The total is cumulative session consumption, never a context percentage. `CTX --` until a verified occupancy and capacity exist. |
| Tools | Done, failed, active | Six separately labelled category bars scale to the largest observed category; the adjacent value carries the magnitude. Tool arguments and paths are never shown. |
| MCP Radar | Status markers on two orbits | Aggregate `online / total`, `n/total shown` when the eight-entry detail list is a subset, and a cycling alias caption. Connected entries are round and on the inner orbit; the other five classes use square markers on the outer orbit. |
| System | USB host, bridge readiness, OpenCode availability | OpenCode version (when the capability is present), firmware, bridge version, protocol major and any `DIAG` code. |

**VERIFIED data rules.** A missing duration, counter, total or context value shows two dashes. Zero
remains a number. Totals can be derived from two known components using a wide sum; when the wide
token total exceeds uint32, the bridge omits it and the device derives it. Both operands and a
nonzero sum are required for a coloured token distribution. The MCP aggregate can exceed the eight
aliases permitted in one detail frame; the subset caption makes that explicit. Radar angles index the
supplied detail list. System shows CDC host presence separately from protocol readiness. A
disconnected dashboard with retained session data identifies `LAST SNAPSHOT` and the `STALE`
footer.

**Localization.** Every fixed label comes from `Localization.cpp`; the three native sheets are
`screens.png`, `screens-fr.png` and `screens-de.png`. Screen titles are `SESSION`, `JETONS` /
`TOKEN`, `OUTILS` / `WERKZEUGE`, `RADAR MCP` / `MCP-RADAR`, `SYSTÈME` / `SYSTEM`.

**Layout.** Seven System rows start at y=50 with a 19 px pitch; a diagnostic code sits at y=181 and
the footer at y=194. The MCP aggregate is at y=152, the subset caption at y=168 when present, and the
alias caption at y=177 or 181. The six-position pager remains at y=205. All text keeps the measured
106 px safe radius.

**NOT VERIFIED** on the Phase 4 hardware image — small-label legibility, accented glyphs and colour
separation in bright ambient light. The preview is for composition and motion review.
