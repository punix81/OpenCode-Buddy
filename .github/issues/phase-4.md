# Phase 4 — Developer dashboard

## Objective

Complete the six-screen dashboard with real, honest metrics and a coherent, accessible visual language, in English, French and German.

## Technical scope

- Buddy, Session, Tokens, Tools, MCP Radar, System screens.
- Token and tool metrics, context gauge with explicit unavailability, MCP aliasing.
- Layout polish for the 240 × 240 circle, typography scaling, transitions.
- Language support, quiet mode, preference persistence, gesture configuration from the bridge.

## Implementation checklist

- [ ] Implement the Buddy screen with all state animations.
- [ ] Implement the Session screen with model, agent, duration and session count.
- [ ] Implement the Tokens screen with in/out/total and conditional context gauge.
- [ ] Implement the Tools screen with success/failure/running and six categories.
- [ ] Implement the MCP Radar with orbit placement, summary and alias labels.
- [ ] Implement the System screen with USB, bridge, OpenCode, firmware/protocol versions and error codes.
- [ ] Implement `en`, `fr`, `de` string tables with overflow handling.
- [ ] Implement quiet mode and its effect on animation and auto-switching.
- [ ] Implement configurable gesture timings from the `config` message.
- [ ] Verify every screen at 40 cm, in bright and dim light.

## Dependencies

Phase 1 rendering, Phase 2 protocol fields, Phase 3 real data.

## Acceptance criteria

- All six screens render correctly within the circular safe area, with no clipped or overlapping text.
- No invented value: unavailable data shows `--` with a reason.
- Language switch applies without reboot; no string overflows.
- Quiet mode keeps alerts visible while suppressing ambient motion.
- A UI review (screenshots) is approved.

## Testing requirements

- Screenshot set for each screen × each language × key states.
- Contrast check of all text tokens.
- Animation frame-rate re-measurement with the final layouts.
- Preference persistence test across power cycles.

## Expected deliverables

- Final `ScreenManager`, `BuddyFace`, `AnimationEngine`, `PreferencesManager` behaviour.
- Screenshot gallery in the phase report.
- Updated `docs/ui-design.md` to match the implementation.
- Phase 4 report.

## Gate

Visual approval on hardware.
