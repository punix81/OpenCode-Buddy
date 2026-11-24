# Hardware audit — OpenCode Buddy (Phase 0)

Scope: establish the exact, working hardware configuration from the pre-existing `Codex-Quota-Mini`
project without modifying it, and record what is verified, assumed, untested or blocking.

Reference checkout: `../Codex-Quota-Mini` (sibling directory, read-only input).
Every claim below cites the reference file it comes from.

## 1. Verified configuration

### 1.1 Display — GC9A01, 240 × 240, SPI

Source: `../Codex-Quota-Mini/include/display.h`.

| Property | Value | Evidence |
| --- | --- | --- |
| Panel driver | `lgfx::Panel_GC9A01` | `panel_` member type |
| SPI host | `SPI2_HOST` | `spi.spi_host = SPI2_HOST` |
| Write clock | 27 000 000 Hz | `spi.freq_write = 27000000` |
| SCLK | GPIO2 | `spi.pin_sclk = 2` |
| MOSI (SDA) | GPIO4 | `spi.pin_mosi = 4` |
| MISO | unused | `spi.pin_miso = -1` |
| DC | GPIO1 | `spi.pin_dc = 1` |
| CS | GPIO5 | `panel.pin_cs = 5` |
| RST | GPIO0 | `panel.pin_rst = 0` |
| Colour inversion | enabled | `panel.invert = true` |
| RGB order | BGR | `panel.rgb_order = true` |
| Rotation | 0 | `tft.setRotation(0)` in `src/main.cpp` |
| Full-frame sprite | 240 × 240 at 8 bpp | `frame.setColorDepth(8)` + `createSprite(240, 240)` |

The 8-bit sprite allocates 57 600 bytes and was created successfully on the ESP32-C3 in the reference
build, which demonstrates the memory headroom assumption used in `docs/architecture.md`.

### 1.2 Touch — TTP223

Source: `../Codex-Quota-Mini/src/main.cpp`.

| Property | Value | Evidence |
| --- | --- | --- |
| Signal | GPIO6 | `constexpr uint8_t kTouchPin = 6;` |
| Mode | `INPUT_PULLDOWN` | `pinMode(kTouchPin, INPUT_PULLDOWN)` in `setup()` |
| Active level | HIGH when touched | `digitalRead(kTouchPin) == HIGH` |
| Debounce | 35 ms | `constexpr uint32_t kDebounceMs = 35;` |
| Power | 3V3 / GND | `README.md` wiring table |

### 1.3 USB serial

| Property | Value | Evidence |
| --- | --- | --- |
| USB mode | hardware CDC on boot | `-DARDUINO_USB_MODE=1`, `-DARDUINO_USB_CDC_ON_BOOT=1` in `platformio.ini` |
| Baud | 115 200 | `Serial.begin(115200)`; host side `serial.Serial(port, 115200, ...)` in `bridge.py` |
| RX buffer | 1024 bytes | `Serial.setRxBufferSize(1024)` |
| Line buffer | 512 bytes, overflow discarded | `char serial_line[512]`, `discard_line` flag |
| Framing | newline-terminated JSON, `\r` ignored | `pollSerial()` |
| Payload shape | JSON object with `v`, `ok`, `pages[]` | `acceptFrame()` |

The reference uses the ESP32-C3 native USB peripheral (no USB-UART bridge chip). A real device was
detected during this audit as an Espressif USB JTAG/serial debug unit (vendor `303a`, product `1001`)
exposing `/dev/ttyACM0`.

### 1.4 Toolchain

Source: `../Codex-Quota-Mini/platformio.ini` and the local PlatformIO caches.

| Item | Value |
| --- | --- |
| Platform | `espressif32@6.5.0` |
| Board | `esp32-c3-devkitm-1` (used for the Super Mini layout) |
| Framework | `arduino` |
| Flash | 4 MB (`maximum_size` 4 194 304) |
| Usable RAM | 327 680 B (`maximum_ram_size`) |
| Upload speed (reference) | 460 800 |
| LovyanGFX | 1.2.21 |
| ArduinoJson | 7.4.3 |
| WiFiManager | 2.0.17 (reference only — **not** used by Buddy) |

Reference build artefacts dated 2026-11-24 exist (`firmware.bin` = 860 304 B). They are evidence that
the reference configuration produced a build; they were not rebuilt during this audit.

## 2. Wiring (to be reproduced exactly)

| Component pin | ESP32-C3 Super Mini | Notes |
| --- | --- | --- |
| Display VCC | 3V3 | |
| Display GND | GND | |
| Display SCL (SCLK) | GPIO2 | SPI clock |
| Display SDA (MOSI) | GPIO4 | SPI data |
| Display DC | GPIO1 | data/command |
| Display CS | GPIO5 | chip select |
| Display RST | GPIO0 | reset |
| Display BLK | 3V3 (module-dependent) | If the module exposes it; keep as on the reference build |
| TTP223 VCC | 3V3 | |
| TTP223 GND | GND | |
| TTP223 I/O | GPIO6 | active HIGH |
| USB-C | USB-C data cable | power + CDC data |

Full reproduction notes: `hardware/wiring.md`. Bill of materials: `hardware/bom.md`.

## 3. Findings

### F-01 — The active device is currently running the reference firmware (VERIFIED)

The ESP32-C3 was enumerated during the audit and the port was held open by the pre-existing Codex
Quota Mini bridge process. Flashing OpenCode Buddy firmware will **replace** that firmware.

Consequences:

- Flashing requires explicit approval and a documented restore path (rebuild and re-upload from
  `../Codex-Quota-Mini`, which must stay untouched).
- The saved reference `firmware.bin` can be re-uploaded to restore without rebuilding.

### F-02 — Single-owner serial port (VERIFIED)

`/dev/ttyACM0` is an exclusive resource. The reference bridge and the Buddy bridge cannot run at the
same time. During Phase 2/3 testing, stop the pre-existing bridge service first; do not change its
configuration permanently.

### F-03 — GPIO0 is a strapping pin (ASSUMPTION → confirm in Phase 1)

GPIO0 is the display reset in the proven wiring. On ESP32-C3, GPIO0 is sampled at boot for the ROM
download mode. The reference build works in practice, implying the reset line's idle state is
compatible. Phase 1 must confirm that a cold boot with our wiring never enters download mode; if it
does, the mitigation is a brief release delay of the reset line, not a wiring change.

### F-04 — GPIO2 is also a strapping pin (ASSUMPTION)

GPIO2 is used as SPI clock. It worked in the reference design. Keep the display unselected during
boot (CS high) and avoid driving the bus before `tft.init()`.

### F-05 — Supply headroom not measured (NOT VERIFIED)

The Super Mini's 3.3 V regulator and the display backlight current were not measured. The reference
build runs, so the combination is viable at 27 MHz SPI. Phase 1 should measure brown-out behaviour
during peak backlight and animation load. No additional component is allowed, so mitigation is
limited to brightness and refresh strategy.

### F-06 — No MISO / no touch interrupt line (VERIFIED)

The display has no read-back path and the TTP223 has no separate interrupt pin in this wiring.
The firmware therefore polls touch in the main loop (as the reference does) and never reads from the
panel.

### F-07 — Toolchain is not currently executable (BLOCKER for Phase 1 builds)

- `pio` is **not installed** on this machine (`command not found`), although
  `~/.platformio/platforms/espressif32` (6.5.0) and packages (framework, RISC-V toolchain) are cached.
- `arduino-cli` 1.5.1 is installed but has no platform or library index and cannot reach
  `downloads.arduino.cc` from this network; it cannot build this project as-is.

Phase 1 prerequisite: install PlatformIO Core (network access and user approval required) or make the
cached PlatformIO environment executable. The audit did **not** attempt to install anything.

### F-08 — Reference project is clean and untouched (VERIFIED)

`git status --porcelain` in `../Codex-Quota-Mini` returned no entries. No file in that project was
modified during this audit.

## 4. Electrical and mechanical notes

- All signals are 3.3 V; the GC9A01 module and the TTP223 module are 3.3 V compatible. No level
  shifter is needed and none may be added (constraint CON-001).
- The TTP223 is configured in its default momentary mode; its output is push-pull, so the internal
  pulldown is a safety measure rather than a requirement.
- Keep the SPI leads short (< 10 cm) to preserve signal integrity at 27 MHz.
- The circular display's visible area is 240 px across, but the corners are masked: design within
  radius 108 px (`docs/ui-design.md`).
- Enclosure work is deferred to Phase 6; no mechanical measurement was taken.

## 5. What this audit did not do

- It did not flash, reset or probe the device electrically.
- It did not rebuild the reference firmware.
- It did not measure current, temperature, frame rate or brown-out margins.
- It did not verify a second physical unit.

Those items are Phase 1 acceptance work and require physical access plus explicit approval.

## 6. Phase 1 update (2026-11-24)

- **F-07 resolved for builds.** PlatformIO Core 6.2.0 was installed into a project-local `.venv`
  using the system trust store, and the cached `espressif32@6.5.0` platform was used. LovyanGFX
  1.2.21 was linked from the reference project's cache because the PlatformIO registry did not
  complete behind the proxy. TLS verification stayed enabled. The Buddy firmware compiled cleanly;
  see `docs/phase-1-report.md` §7.
- **F-03, F-04, F-05 remain open.** Boot strapping on GPIO0/GPIO2, and supply/brown-out margins,
  still require the hardware session and have not been observed.
- **Still not flashed.** The board continues to run the reference firmware, and its serial port is
  still owned by the reference bridge. Flashing needs explicit approval and an agreed restore path.

## 7. Board swap (2026-11-24, Phase 2 validation)

The Product Owner replaced the ESP32-C3 during Phase 2 hardware validation. The new unit is a
separate physical board; the Phase 1 4 MB dump belongs to the previous unit and **must not** be
restored to this one.

| Property | Observed value |
| --- | --- |
| Chip | ESP32-C3 (QFN32), revision v0.4, single core, 160 MHz |
| Flash | 4 MB embedded (XMC), detected by esptool |
| USB | Espressif `303a:1001`, native USB JTAG/serial debug unit |
| MAC | recorded locally for identification; deliberately not committed |

Because the flash contents of a new board are unknown, the application alone is not sufficient: the
bootloader (`0x0`), partition table (`0x8000`), `boot_app0` (`0xe000`) and the application
(`0x10000`) are written together, then verified region by region.

Two hardware facts were confirmed on this unit:

- `--after hard-reset` toggles RTS, which is **not** wired to EN; the chip can stay in the ROM
  bootloader and run nothing. Use `--after watchdog-reset` to start the application.
- The default 256-byte USB CDC RX queue overflows while a full-screen render blocks the loop, losing
  bytes mid-frame. The reference firmware also enlarged it (`Serial.setRxBufferSize(1024)`); Buddy
  uses 4096. With that value the handshake is error-free on this board.
