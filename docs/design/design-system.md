# The optical face and instrument dial

**VERIFIED implementation.** All six pages use the indexed sprite in Theme. The panel center is (120,120). Coordinates in the renderer use (110,110) because the sprite starts at (10,10). A single 48,400-byte pixel plane carries both the face and text. LovyanGFX also allocates a 256-entry RGB palette at startup.

| Role | RGB source | Application |
|---|---|---|
| Night / surface / raised | #080E19 / #101827 / #182334 | Panel, recessed visor, visor rim |
| Border / secondary / primary | #324055 / #9CABBD / #F1F5F9 | Tracks, supporting text, metrics and reflections |
| Mint / blue / cyan | #34D399 / #60A5FA / #38BDF8 | Idle and success, thinking, generating |
| Violet / amber / lilac | #A78BFA / #FBBF24 / #CEABFF | Working, permission, input |
| Coral / aqua / orange | #F87171 / #22D3EE / #FB923C | Error, compacting, retry |
| Slate / sand | #768CA5 / #E4BD85 | Offline, interrupted |

Each accent has a darker surround and a lighter lens fill. The lookup table is initialized once. The panel receives RGB565 through LovyanGFX. A muted state retains its label and silhouette.

**VERIFIED typography.** Font2 carries metadata. FreeSans 9 pt, FreeSans Bold 12 pt and FreeSans Bold 24 pt carry body text, state titles and hero metrics. All are bundled in the pinned graphics library. This change adds no font files. Fit starts with the selected font, measures textWidth and fontHeight, and intersects the requested column with the safe chord at the more distant text edge. Long strings step down through the type scale and receive a measured ellipsis. Each identity retains its own column when the combined line is too long.

**Phase 4 accented typography.** The bundled fonts cover ASCII only, so French and German accents are composed from the same font: the base glyph is drawn with the normal metrics and a small primitive mark is placed above the measured cap/x-height (or below the baseline for a cedilla). This preserves the FreeSans look and adds no font file. The fit uses the composed width; ASCII strings keep the single `drawString()` fast path. See `docs/localization.md`.

**VERIFIED layout.** Content fits a radius of 108 px. Text uses a 106 px radius. The six-position pager sits at sprite y=205. Arcs share a common center. A bright, wider dash identifies the current page. The footer identifies the data source/status (`LIVE`, `MOCK`, `OFFLINE`, `STALE`) and quiet mode.

**NOT VERIFIED** on the GC9A01 in its enclosure — perceived color separation, contrast and reading distance. The preview is for composition and motion review.
