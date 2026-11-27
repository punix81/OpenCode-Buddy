# Dependencies

Date: 2026-11-27. Versions verified in this workspace. Lockfile:
`bridge/package-lock.json`, sha256 `a00faceadd0b5785bbb8d8950e3aa79dde41d1c2b5aff5f02451f4e9e3e6aa53`.

## Bridge — runtime

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| `serialport` | 13.0.0 | MIT | USB CDC transport (native bindings) |
| `@serialport/bindings-cpp` | 13.0.0 | MIT | Native binding used by serialport |
| `@serialport/stream` | 13.0.0 | MIT | Stream wrapper |
| `@serialport/binding-mock` | 10.2.2 | MIT | Test/bench only, shipped by serialport |
| `@serialport/parser-*` | 13.0.0 | MIT | Optional parsers shipped by serialport; the bridge uses its own framer |
| `debug` | 4.4.0 | MIT | Transitive diagnostic helper |
| `node-addon-api`, `node-gyp-build`, `@serialport/bindings-interface` | 8.3.0 / 4.8.4 / 1.2.2 | MIT | Native build support |

Only `serialport` is imported by the bridge source. The other runtime entries are its transitive
packages.

## Bridge — development

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| `typescript` | 5.8.3 | Apache-2.0 | Typecheck/build |
| `tsx` | 4.23.15 | MIT | TS runner for the CLI and tests |
| `esbuild` (+ platform binaries) | 0.28.2 | MIT | tsx dependency; optional per-platform packages |
| `ajv` | 8.20.0 | MIT | Protocol schema validation in `validate:protocol` |
| `@types/node` | 24.4.0 | MIT | Node types |
| `eslint` | 10.12.0 | MIT | Static analysis (lint gate) |
| `typescript-eslint` (+ `@typescript-eslint/*`) | 8.71.0 | MIT | TypeScript rules for ESLint |
| `fast-uri` | 3.1.9 | BSD-3-Clause | ajv dependency |
| `fast-deep-equal`, `json-schema-traverse`, `require-from-string` | 3.1.3 / 1.0.0 / 2.0.2 | MIT | ajv dependencies |

`esbuild` ships 26 optional platform packages in the lock; only the host one is installed and used.
No duplicate runtime dependency was found; `npm ls --all` is clean.

## Firmware — PlatformIO

| Package | Version | License | Purpose |
| --- | --- | --- | --- |
| `platformio/espressif32` | 6.5.0 | Apache-2.0 (platform) | Board/platform definition |
| `framework-arduinoespressif32` | 3.20014.231204 (Arduino core 2.0.14) | LGPL-2.1 (core), Apache-2.0 (ESP-IDF components) | Arduino API, USB CDC, NVS |
| `toolchain-riscv32-esp` | 8.4.0+2021r2-patch5 | GPL-3.0 with GCC runtime exception (build tool) | Compiler |
| `tool-esptoolpy` | 1.40501.0 | GPL-2.0 (build/flash tool) | esptool.py packaged by PlatformIO |
| `LovyanGFX` | 1.2.21 | FreeBSD (BSD-2-Clause) | GC9A01 driver and canvas |
| `ArduinoJson` | 7.4.3 | MIT | NDJSON parsing |

The host tests use the system `g++` 15.2.0 (GPL with runtime exception) and the cached ArduinoJson
headers. The fuzz target is built with ASan/UBSan.

## Tools and preview

| Tool | Version | License | Purpose |
| --- | --- | --- | --- |
| Node.js | 24.22.3 | MIT | Runtime |
| npm | 11.19.1 | Artistic-2.0 | Package manager |
| PlatformIO Core | 6.2.0 (project `.venv`) | Apache-2.0 | Firmware build |
| Python | 3.14.4 | PSF-2.0 | Preview/tests |
| Pillow | 12.1.1 | HPND | Preview rendering (development only) |
| esptool | 5.7.0 (local tool) | GPL-2.0 | Application-only flash |

## Vulnerability status

`npm audit` could not authenticate to the corporate registry's advisory endpoint:

```
npm error audit endpoint returned an error
Unable to authenticate ...
```

Consequence: **vulnerability status is NOT VERIFIED**. No claim of "zero vulnerabilities" is made.
Re-run the audit in an environment where the advisory endpoint is authorized, or use the SBOM with a
local scanner. The runtime surface is small (serialport + Node built-ins) and no dependency has a
known unmaintained status confirmed in this session.

## SBOM

`docs/evidence/phase-5-sbom.json` — CycloneDX 1.5, generated locally with
`npm sbom --sbom-format cyclonedx --omit dev` from the lockfile (21 components, no network). The
development tree is fully described by `package-lock.json` and the table above.

## Update policy

No uncontrolled major upgrade. Any update must be justified, pinned, tested with `scripts/qa.sh`,
and recorded here with its license. The firmware platform and libraries stay pinned in
`firmware/platformio.ini`.

## Publication note

`bridge/.npmrc` sets `omit-lockfile-registry-resolved=true`: the committed lockfile records package
names, versions and integrity hashes but no registry-specific `resolved` URL. It therefore contains
no internal hostname, and `npm ci` resolves through whatever registry the environment configures
without changing the pinned versions or hashes. Regenerate the lock with the `.npmrc` in place; do not
commit a lockfile that reintroduces environment-specific URLs. The SBOM under `docs/evidence/` was
generated with `--omit dev` and references the public registry.
