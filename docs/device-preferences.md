# Device preferences and configuration workflow

Date: 2026-11-26
The device owns its display preferences. The host may override them explicitly; a normal handshake
never resets them.

## 1. Stored on the device (NVS)

| Key | Type | Values | Owner |
| --- | --- | --- | --- |
| `lang` | uint8 | 0=en, 1=fr, 2=de | Device, optional host override |
| `quiet` | bool | on/off | Device, optional host override |
| `screen` | uint8 | 0…5 | Device (last visited dashboard) |

`PreferencesManager` validates an invalid value back to the default and writes **only when the value
changes**. No session, prompt, path or token is ever stored in NVS.

## 2. Gestures (unchanged)

| Gesture | Action |
| --- | --- |
| Short press | Next screen |
| Double press | Return to Buddy |
| Long press (1.5 s) | Toggle quiet mode, localized toast |
| Very long press (5 s) | Reset preferences to defaults, localized toast |

`TouchManager` fires `VeryLong` once per continuous press (`veryLongFired_` is cleared only on a new
press); the release then never produces `Long` or `Short`. The host gesture test covers the
exclusivity.

## 3. Configuration workflow

**Decision: no graphical settings app and no new gesture.** The supported workflow is the existing
local configuration file plus the existing gestures. This was the proposed workflow in
`docs/phase-4-plan.md`; no interaction meaning changed in Phase 4.

The bridge reads `config.local.json` (or `BUDDY_CONFIG`) and accepts:

| Key | Default | Effect |
| --- | --- | --- |
| `language` | `null` | `"en"`, `"fr"` or `"de"`; explicit override, applied without reboot and persisted |
| `quietMode` | `null` | `true`/`false`; explicit override, persisted |
| `autoReturnSeconds` | `60` | 10–600 s before a dashboard returns to Buddy; host-side, sent in `config` |
| `allowRealMcpNames` | `false` | Show real MCP names instead of stable `MCP-n` aliases; privacy-sensitive |
| `stateIntervalMs` | `1000` | Snapshot cadence |
| `source` | `"live"` | `"live"` or explicit `"mock"` |

Example, intentionally showing only non-secret display fields:

```json
{
  "language": "fr",
  "quietMode": false,
  "autoReturnSeconds": 90,
  "allowRealMcpNames": false
}
```

The file is user-owned, is not committed, and its content is never logged.

## 4. Ownership and synchronization rules

1. `config.language` and `config.quietMode` are optional. A firmware advertising
   `caps:["config.partial"]` receives neither unless the host explicitly overrides it; it keeps its
   stored value.
2. A firmware without the capability receives the legacy `language:"en"` and `quietMode:false`,
   because its parser requires the fields. This is the only compatibility reset, and it is documented.
3. Every handshake/resync sends `config`; the setters skip unchanged values, so a reconnect does not
   write NVS.
4. The very-long press is the only deliberate reset. It clears the three keys and returns the runtime
   values to English, loud, Buddy screen.
5. `autoReturnSeconds` is a host-side runtime setting, not stored in NVS; a device without a host keeps
   its 60 s default. The parser clamps 10–600 s and warns with `E_BOUNDS` on a clamped value.
6. `allowRealMcpNames` never reaches the device as a preference: the bridge chooses the alias or the
   real name before the privacy projection. Default false.

## 5. Language without reboot

`ScreenManager` renders with `languageFrom(preferences_->language())` and compares the preference
with the last rendered value on every `update()`. An override therefore repaints within one frame; no
restart is involved. The value persists across bridge restart, USB reconnect and MCU reboot.

## 6. Verification

Automated:

- `firmware/test/host/test_touch.cpp`: exclusive gestures; one very-long per continuous press.
- `firmware/test/host/test_protocol.cpp`: `config` validation, clamping and warning.
- `bridge/test/config.test.ts`: default ownership, explicit overrides, auto-return bounds.
- `bridge/test/bridge.test.ts`: legacy versus `config.partial`, explicit host override only, no reset
  on a normal handshake.

**Physical (Phase 4 image, before the USB blocker) — V01 VERIFIED:**

1. French override applied immediately without reboot.
2. Bridge restarted without override (config 176 B): French persisted.
3. USB unplug/replug (full MCU power cycle): French persisted.
4. German override applied immediately.
5. Very-long press: exactly one `gesture=very_long`, no extra `long`; reset to English, loud, Buddy.
6. Explicit `quietMode: true` visible; bridge restart without override kept quiet; long press
   returned loud.
7. Explicit German override was reapplied on the next bridge handshake after the reset (host
   override wins); this is the documented behaviour: the device reset is local, the host override is
   reapplied only when the host synchronizes again.
8. Auto-return: 90 s (no premature return at 69 s, return to Buddy), 20 s timer reset after a touch,
   10 s quiet mode disabled the return, loud mode re-enabled it. 10/600 limits are validated by the
   parser/config tests; default 60 is the compiled/config default.

The Phase 4 image was later removed for the USB CDC blocker and Phase 3.1 restored; the Phase 3.1
firmware does not contain the localization UI, but the same NVS preference path is in use.
