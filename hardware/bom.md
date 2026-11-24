# Bill of materials

All parts are already owned; the project adds no components.

| # | Part | Specification | Qty | Notes |
| --- | --- | --- | --- | --- |
| 1 | MCU board | ESP32-C3 Super Mini, RISC-V, native USB-CDC | 1 | 4 MB flash, ~320 kB usable RAM |
| 2 | Display | GC9A01 circular IPS, 1.28", 240 × 240, SPI, 3.3 V | 1 | Proven with LovyanGFX 1.2.21 |
| 3 | Touch sensor | TTP223 capacitive module, 3.3 V, momentary, active HIGH | 1 | Single pad |
| 4 | Cable | USB-C data cable | 1 | Must support data, not charge-only |
| 5 | Enclosure | Optional 3D printed shell | 0–1 | Phase 6, not required for the prototype |

## Not included, not required

- Level shifters, resistors, capacitors, transistors, buzzers, LEDs, batteries, antennas.
- Wi-Fi or Bluetooth usage: both are disabled in firmware.

## Firmware dependency licences

| Library | Version | Licence |
| --- | --- | --- |
| LovyanGFX | 1.2.21 | FreeBSD-style (see upstream) |
| ArduinoJson | 7.4.3 | MIT |

Licence verification is repeated in the Phase 5 dependency audit, including the full transitive set.
