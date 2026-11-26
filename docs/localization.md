# Localization

Date: 2026-11-26
Languages: English (`en`), French (`fr`), German (`de`). The product name **OpenCode Buddy** and the
technical names OpenCode, MCP, Shell and CTX are never translated.

## 1. Architecture

All firmware labels live in `firmware/src/Localization.{h,cpp}`:

- `TextId` enumerates every fixed label: screen titles, section labels, tool categories, MCP statuses,
  system rows and values, source/status words, toasts and diagnostic prefix.
- `kStrings[3][TextId::Count]` is the complete table. A missing row or a null entry is a test failure.
- `stateLabel()` holds the twelve execution-state words; `stateText()` adds the interaction count
  (`Permission (3)`, `Saisie requise (1)`) only for the matching state.
- `toolLabel()`, `mcpStatusLabel()` and the `format*` helpers keep word order and singular/plural out
  of the renderer. `formatSessionCount`, `formatAttempt`, `formatMcpTotals` and `formatMcpShown` own
  their `%u` placeholders, so a translation cannot mismatch a call site.

The renderer never concatenates a translated fragment with English text. `Dashboard.cpp`,
`BuddyFace.cpp` and `ScreenManager.cpp` receive a `Language` value; `ScreenManager` reads the device
preference on every render.

## 2. Language source and switching

1. `PreferencesManager` stores `lang` in NVS (`0=en`, `1=fr`, `2=de`); an invalid byte falls back to
   English.
2. The bridge sends `config.language` only when the host explicitly overrides it. A firmware without
   `config.partial` receives the legacy `en` field and resets to English, as before.
3. `flushProtocol()` applies the override immediately through `PreferencesManager::setLanguage()`.
   The setter writes NVS only when the value changes.
4. `ScreenManager::update()` compares the current value with the last rendered value and marks the
   canvas dirty; the new language appears on the next frame **without a reboot**.
5. The value survives a bridge restart, USB reconnect and MCU reboot because it lives in NVS. The
   very-long-press reset removes the key and returns to English.

## 3. Fonts and accented characters

The pinned LovyanGFX fonts cover ASCII 0x20–0x7E only: `Font2` for small metadata, FreeSans 9 pt for
body, FreeSans Bold 12 pt for state titles and FreeSans Bold 24 pt for metrics. No new font file is
added.

`Theme::text()` decodes UTF-8 and composes Latin-1 letters from the **same font**:

- the base letter is drawn with the font's normal metrics;
- the accent is drawn as a small primitive (acute, grave, circumflex, diaeresis, tilde or cedilla)
  above the measured cap height (upper case) or x-height (lower case), or below the baseline for a
  cedilla;
- the accent scales with the font box (width `max(3, h/5)`, depth `max(2, h/6)`), so 8 px metadata
  and 26 px titles both stay legible.

Supported: `À Â Ä Ç È É Ê Ë Î Ï Ô Ö Ù Û Ü à â ä ç è é ê ë î ï ô ö ù û ü ÿ` and the ligature
expansions `ß→ss`, `æ→ae`, `œ→oe`. Unsupported code points render as `?` rather than silently
disappearing. The translations use only the supported set; `test_localization.cpp` scans every table
entry and fails on an unsupported sequence. Words requiring `î`/`ï` are avoided because the base `i`
already carries a dot.

`Theme::text()` measures with the composed width (accent adds no advance), applies the same safe-disc
chord and font-step-down as before, and truncates at a UTF-8 code-point boundary with `...`. ASCII
strings keep the original single `drawString()` fast path; only accented strings use the per-glyph
path.

## 4. Translation rules

- Screen titles are short and upper case where the design uses upper case: `SESSION`, `JETONS` /
  `TOKEN`, `OUTILS` / `WERKZEUGE`, `RADAR MCP` / `MCP-RADAR`, `SYSTÈME` / `SYSTEM`.
- State words fit the 12 pt title line, including `Berechtigung`, `Eingabe nötig`,
  `Unterbrochen`; the renderer would step down a font if a future word were longer.
- German is longer than English. Every label is measured at its actual position; labels that were
  truncated in a first review (`Version OpenCode`, `Bridge-Version`, `En cours`, `Recherche`) were
  shortened (`Version OC`, `Ver. bridge`, `Actif`, `Rech.`) instead of shrinking the type below the
  design.
- French uses `DIRECT` for the LIVE footer, `SILENCE`/`SON` for quiet toasts and `RÉINIT.` for reset.
- All three tables are complete; there is no fallback to English at runtime except for a corrupted
  language byte.

## 5. Layout and verification

- The dashboard sheets in `docs/design/previews/` are generated at the native 240×240 resolution for
  all three languages.
- `tools/ui-preview/test_preview.py` asserts that every language changes every dashboard, that all
  profiles stay inside the circular safe area, and that the images are 240×240.
- `firmware/test/host/test_localization.cpp` asserts completeness, supported accents, placeholders,
  interaction-count suffixing and bounded language mapping.
- **Hardware legibility (Phase 4 image): VERIFIED by the Product Owner.** The six screens were
  reviewed in English, French and German on the physical panel; accents (`Réflexion`, `Système`,
  `Hôte`, `Prêt`, `Läuft`), long German labels, French tool categories, the seven System rows and the
  MCP subset caption were legible, with no clipped or misplaced text. The immediate French/German
  switch and persistence across bridge/USB/MCU restarts were also verified. The Phase 4 image was
  later removed for the unrelated USB CDC blocker (see
  `docs/evidence/phase-4-hardware-validation.md`); Phase 3.1 is installed.

## 6. Adding a string

1. Add the `TextId` before `Count`.
2. Add one entry to each of the three rows in `Localization.cpp` (the same position).
3. Run `bash firmware/test/host/run.sh`; a missing or unsupported entry fails immediately.
4. Render the affected screen in `python3 tools/ui-preview/preview.py --sheets` and inspect the
   native sheet in all three languages.
5. Never add a translated string by concatenating two fragments in a renderer.
