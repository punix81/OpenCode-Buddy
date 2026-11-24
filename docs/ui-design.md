# UI and interaction design — OpenCode Buddy

Target: GC9A01, 240 × 240 px, circular, dark theme, viewed at 40–60 cm.

## 1. Geometry and grid

- Canvas is 240 × 240; the panel masks the corners, so all content lives inside a **circle of
  radius 108 px** centred at (120, 120). Nothing is placed in the corner regions.
- Safe text band: x ∈ [40, 200] at the vertical extremes, wider in the middle:
  - rows 40–80: max width 150 px
  - rows 90–150: max width 200 px
  - rows 160–200: max width 150 px
- Outer ring (radius 108–112) is reserved for status: connection, notifications, activity pulse.
- Spacing scale: 4 / 8 / 12 / 16 px. Baselines: title 42, primary value 120, secondary 158,
  footer 186.
- Page indicator: five small dashes at y = 206, centred, only when more than one screen applies.

## 2. Visual language

| Token | Value (RGB565 source) | Use |
| --- | --- | --- |
| `bg` | #000000 | Background |
| `surface` | #101418 | Cards, panels |
| `text` | #FFFFFF | Primary values |
| `muted` | #9AA4AE | Labels, units |
| `accent` | #4EA1FF | Idle/active neutral, focus |
| `ok` | #46D17A | Success |
| `warn` | #FFA733 | Permission, retry, stale |
| `error` | #FF5C5C | Failure |
| `thinking` | #B58CFF | Reasoning phase |
| `grid` | #1E252C | Rings, separators |

Rules:

- **Never colour alone.** Every state also changes shape (eye form, ring pattern), a text label, and
  motion. This keeps states readable for colour-vision-deficient users and in bright light.
- Contrast: body text ≥ 7:1 on `bg`; labels ≥ 4.5:1. No thin 1 px text; minimum stroke 2 px.
- Typography (LovyanGFX built-in fonts): `FreeSansBold9pt7b` for titles, `FreeSansBold12pt7b` for
  primary metrics, `FreeSans9pt7b` for labels, one monospaced face for counters so digits do not
  jitter. Text is auto-shrunk one step if it exceeds the safe width, never clipped.
- Numbers are right-aligned when in a column, centred when alone.
- Unavailable data renders as `--` plus the reason (`not exposed`), never as `0`.

## 3. Buddy states

The face is procedural: two eyes (arc/ellipse), optional mouth, optional ring and particles. Eye
geometry is shared by all states so the character stays the same character.

| State | Eyes | Mouth | Ring / motion | Label |
| --- | --- | --- | --- | --- |
| OFFLINE | closed lines | none | dim grey ring, no pulse | `OFFLINE` |
| IDLE | open, slow blink every 3–6 s | soft smile | calm accent ring, 0.5 Hz breathing | `IDLE` |
| THINKING | look up-left, small saccades | flat | three dots orbiting above, 1 Hz | `THINKING` |
| GENERATING | open, slight squint | open, subtle | three dots travelling left→right with a trailing fade | `GENERATING` |
| WORKING | focused, narrowed | flat | code glyphs (`< > { } ;`) drifting in the ring, plus a spinner arc | `WORKING` |
| PERMISSION_REQUIRED | wide open, raised brows | small "o" | orange ring pulsing 0.8 Hz + `!` badge | `PERMISSION` |
| USER_INPUT_REQUIRED | one eye slightly raised | tilted line | orange ring dashed, `?` badge | `QUESTION` |
| SUCCESS | happy arcs (^ ^) | wide smile | three stars pop and fade, green ring sweep | `DONE` |
| ERROR | crossed lines | inverted arc | red ring, two short shakes, `×` badge | `ERROR` |
| COMPACTING | half-closed | flat | circular arrow segments rotating 0.6 Hz | `COMPACTING` |
| RETRYING | looking right | flat | amber dashed ring rotating slowly, attempt count | `RETRY 2` |
| INTERRUPTED | neutral, one blink | flat | grey/amber ring, no motion after first second | `INTERRUPTED` |

Animation budget: 20–30 FPS target, all animations procedural (no stored image sequences). Each
state exposes a 12–32 frame clip; particles are capped at 12. Idle animations are suspended in quiet
mode; alert states keep pulsing.

Motion safety: no flashing faster than 3 Hz; no large-area luminance inversion; transitions ≤ 200 ms.

## 4. Screens

All screens share: status ring, footer with connection dot and notification count, page indicator.
The footer is suppressed when a permission request is pending; the alert band replaces it.

### Screen 1 — Buddy

- Centre: animated face, diameter 150 px.
- Top (y ≈ 42): current state label, e.g. `THINKING`.
- Below face (y ≈ 176): active model, truncated to 20 chars with middle ellipsis.
- Ring: connection (solid = ready, dashed = degraded, absent = offline).
- Badge top-right at 45°: notification count when > 0.
- This is the only screen that animates continuously.

### Screen 2 — Session

- Title `SESSION`.
- Model (wrapped, max 2 lines, 18 chars each).
- Agent name, badge style, e.g. `build`.
- Execution duration `mm:ss` or `h:mm:ss` for the focus session, monospaced.
- `SESSIONS n` with n active.
- Status line with the focus session's phase.
- Duration derives from the execution start timestamp, computed on-device from a monotonic counter
  supplied by the bridge (`elapsedSeconds`), never from the device clock.

### Screen 3 — Tokens

- Title `TOKENS`.
- Primary: total tokens (input + output) formatted with thousands separators, auto-shrunk.
- Rows: `IN` and `OUT` values, right-aligned, monospaced.
- If context usage is reliable: a 270° arc gauge with percentage in the centre; otherwise the gauge
  is replaced by `CTX --` and the reason `limit unavailable`.
- If a quota source exists: a small `QUOTA` row; otherwise omitted entirely (never faked).
- Footer: `cache r/w` only if both values are non-zero, otherwise omitted.

### Screen 4 — Tools

- Title `TOOLS`.
- Three counters in a row: `OK`, `FAIL`, `RUN` with distinct glyphs (`✓`, `✕`, spinner).
- Below: category bars for `READ`, `EDIT`, `SHELL`, `SEARCH`, `MCP`, `OTHER`, each with a horizontal
  bar scaled to the maximum category and a numeric value.
- Running tools animate their bar with a moving highlight.
- Category is derived from the tool identifier only; arguments are never seen.

### Screen 5 — MCP Radar

- Title `MCP`.
- Sweeping radar arc (2.4 s period) as background motion, paused in quiet mode.
- Dots placed on two concentric orbits by status: inner = connected, outer = degraded/failed.
- Summary `n/m ONLINE` in the centre.
- Below: up to three server labels; if more, `+k MORE`.
- Names are aliases (`MCP-1`…) by default; real names only when explicitly enabled in configuration.
- Error text is never drawn on screen: only the status class (`FAILED`, `AUTH`, `PENDING`).

### Screen 6 — System

- Title `SYSTEM`.
- Rows with paired label/value: `USB` (link speed class / connected), `BRIDGE` (version + uptime),
  `OPENCODE` (connected/offline), `FW` (firmware version), `PROTO` (v1).
- Bottom: diagnostic code from the last sanitized error class, e.g. `E-SERIAL`, `E-PARSE`, `E-LINK`.
- Long-press here does not change anything except quiet mode, as everywhere.

## 5. Gestures (TTP223)

| Gesture | Definition | Action |
| --- | --- | --- |
| Short press | press and release < 350 ms | next screen |
| Double press | two short presses within 350 ms | return to Buddy |
| Long press | hold ≥ 1500 ms | toggle quiet mode (haptic-free confirmation: brief ring flash + `QUIET`/`LOUD`) |
| Very long press | hold ≥ 5000 ms | reset display preferences (language → default, screen → Buddy, quiet → off) with a 3 s confirmation screen |

Rules:

- Exclusive classification: a very long press fires only the reset action; the long-press action is
  suppressed once the 5 s threshold is crossed.
- The release event ends a gesture; a second press during the double-press window merges into it.
- Debounce 35 ms, matching the proven reference implementation.
- All timings configurable from the bridge (`config` message); defaults above.
- 60 s without interaction returns to the Buddy screen, unless a permission request is pending (then
  the alert remains visible).
- Quiet mode: no automatic screen changes, no ambient animation; alerts still pulse, but at half
  amplitude and without sound (there is no sound).
- The touch pad has exactly these four actions. It cannot approve, reject, execute or edit anything.

## 6. Accessibility and clarity

- Every state has a text label in addition to shape and colour.
- No state depends on animation alone (a paused animation must still read correctly).
- Language: English (default), French, German. Strings are bounded to the safe widths; if a
  translation overflows, the font shrinks one step, then the string is abbreviated with `…`.
- The display is readable at 40 cm in indoor light with ≥ 9 pt text.

## 7. Out of scope for the UI

- Conversation content, code, diffs, file paths, prompts.
- Interactive approval or text entry.
- Images, avatars or bitmap character art.
