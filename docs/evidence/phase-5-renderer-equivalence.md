# Phase 5 — renderer equivalence

Date: 2026-11-27. Scope: the P5-02 renderer changes against the Phase 4.1 reference. The Codex Astra
design must be preserved; this document is the pixel evidence.

## 1. Method

1. Freeze the reference: build `tools/ui-preview` from the 4.1 renderer and export every combination
   to PNG (6 screens × 3 languages × 7 profiles × 2 quiet modes + 12 states × 3 languages = **288
   images**).
2. Apply the changes (tick span tables, ASCII measurement, binary-search truncation, `Format.cpp`).
3. Rebuild the same preview and export the same 288 images.
4. Compare RGB pixels with Pillow (`ImageChops.difference`): identical iff the diff bounding box is
   empty.

The preview compiles the **firmware sources** (`Dashboard.cpp`, `Theme.cpp`, `BuddyFace.cpp`, …)
against the pinned LovyanGFX Linux sprite backend. It is the project's existing simulator, not a
reimplementation.

## 2. Result

```
files=288 identical=288 differing=0
```

Every image is byte-equivalent in RGB. `python3 preview.py --sheets` was regenerated and produced
**byte-identical** files: `docs/design/previews/` is unchanged.

## 3. What changed, and why the pixels do not

- **Ticks**: the Session 36 and Tokens 28 tick arcs used `fillArc` per tick, which scans the full
  radius bounding box. `tools/ui-preview/gen_ticks.cpp` renders each tick with the **same pinned
  `fillArc`**, captures its exact pixel runs, and emits `firmware/src/TickTables.h` (Session 160
  spans, Tokens 312). The dashboard draws those spans with `drawFastHLine` in the same order and the
  same per-tick colours. The face arcs (28° and 62°) stay on `fillArc`, so the expressions are
  untouched.
- **Text**: `measure()` uses one `textWidth()` for ASCII instead of one per character; composed
  Latin-1 accents keep the per-codepoint path. Truncation uses a binary search over codepoint
  boundaries instead of removing one character and re-measuring the whole string. Both produce the
  same width and the same fitted string; the 288-image comparison confirms it.
- No palette, font, layout, rotation or SPI frequency change.

## 4. Regeneration

```sh
cd tools/ui-preview
make ticks          # rewrites firmware/src/TickTables.h from the pinned fillArc
make               # rebuilds the preview
python3 preview.py --sheets
```

`TickTables.h` is generated; do not edit it by hand. Regenerate it only when the tick geometry or the
pinned LovyanGFX version changes.

## 5. Limit

The preview is the host simulator. The firmware uses the same `LGFX_Sprite` 8-bit palette and the same
`LGFXBase` arc algorithm, so the pixels are expected to match on the panel; the physical confirmation
belongs to the RC flash (not authorised yet). No hardware pixel claim is made here.
