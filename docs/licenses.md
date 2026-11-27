# Licenses

Date: 2026-11-27. This is an engineering inventory, not legal advice. The project is distributed
under the repository `LICENSE`; third-party obligations are listed here.

## 1. License families in the product

| License | Components | Obligation | Compliance |
| --- | --- | --- | --- |
| MIT | serialport and its packages, ArduinoJson, tsx, ajv, esbuild, debug, Node.js | Keep the copyright and permission notice | Notices are kept in `node_modules` and in the SBOM; a release bundle must ship them |
| BSD-2-Clause / FreeBSD | LovyanGFX | Keep the copyright and two conditions | `firmware/.pio/libdeps/.../LovyanGFX/license.txt` is kept with the source |
| BSD-3-Clause | fast-uri | Keep the copyright and three conditions; no endorsement | Notices kept with ajv's dependency tree |
| Apache-2.0 | TypeScript, PlatformIO Core, the ESP32 platform, ESP-IDF components | Keep the license and NOTICE; state changes | Tooling/ESP-IDF; no source changes to those components |
| LGPL-2.1 | Arduino core (`framework-arduinoespressif32`) | Provide the source, allow relinking, keep notices | The core is unmodified and built from the pinned public package; the firmware is rebuilt from this repository by `scripts/qa.sh --firmware` |
| GPL-2.0 / GPL-3.0 + GCC exception | esptool, RISC-V GCC toolchain | Build tools, not linked into the firmware | Used only to compile/flash; the GCC runtime exception covers the linked runtime |
| HPND | Pillow (preview, development only) | Keep the notice | Not shipped on the device |
| PSF-2.0 | Python | Keep the notice | Runtime of the development tools |
| Artistic-2.0 | npm | Package manager | Not shipped |

## 2. Firmware binary

The firmware links:

- the Arduino core (LGPL-2.1) — unmodified, source available from the pinned PlatformIO package and
  rebuildable from this repository;
- ESP-IDF components (Apache-2.0);
- LovyanGFX (BSD-2) and ArduinoJson (MIT).

No GPL-licensed code is linked into the firmware. esptool and the compiler are build tools.

## 3. Distribution notes (Phase 6)

A future installer or binary bundle must include:

- this inventory and the SBOM;
- the MIT/BSD notices of the bundled npm packages;
- the LGPL-2.1 notice and the source/relink offer for the Arduino core;
- the Apache-2.0 notices for ESP-IDF.

Phase 6 packaging must not silently relicense third-party code. The repository `LICENSE` and this
document are the reference.

## 4. Verification

- `docs/dependencies.md` lists every direct and transitive package with its license.
- `docs/evidence/phase-5-sbom.json` is the machine-readable inventory (CycloneDX 1.5).
- `npm ls --all` is clean; the PlatformIO package list is pinned in `firmware/platformio.ini`.
- No dependency was added in Phase 5; the only runtime dependency remains `serialport`.
