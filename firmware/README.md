# Firmware (ESP32-C3)

Status: **not implemented** — Phase 1.

## Planned layout

```text
firmware/
├── platformio.ini          pinned platform and libraries
├── include/
│   └── BoardConfig.h       verified GPIO map (see ../docs/hardware-audit.md)
├── src/
│   ├── main.cpp            setup/loop, wiring of components
│   ├── SerialManager.*     USB CDC, bounded line buffer
│   ├── ProtocolParser.*    NDJSON parse, version/type dispatch
│   ├── StateManager.*      normalized device state, staleness
│   ├── DisplayManager.*    LovyanGFX device, partial refresh
│   ├── ScreenManager.*     six screens, layout helpers
│   ├── BuddyFace.*         procedural expressions
│   ├── AnimationEngine.*   frame scheduling, clips
│   ├── TouchManager.*      gesture state machine
│   └── PreferencesManager.* NVS persistence
└── test/                   native unit tests for pure logic
```

## Constraints

- `esp32-c3-devkitm-1`, `framework = arduino`, `espressif32@6.5.0`, USB CDC on boot.
- Pins exactly as in `docs/hardware-audit.md`; no Wi-Fi, no Bluetooth, no OTA.
- Non-blocking loop; 20–30 FPS target; bounded memory; no per-frame allocation.
- Cannot be built on the audited machine until PlatformIO Core is installed (see
  `docs/hardware-audit.md` F-07).

Flashing requires explicit user approval and a restore plan for the current reference firmware.
