# Build reproducibility

Date: 2026-11-27. The goal is a reproducible **procedure** and a recorded artifact identity. Byte-for-byte
identical firmware across different build paths is not claimed.

## 1. Pinned inputs

| Input | Version / value |
| --- | --- |
| Node.js | 24.22.3 |
| npm | 11.19.1 |
| `bridge/package-lock.json` | sha256 `fa60d26e5c8d8b299d5d693b9820274ce3e8a91e9a0d1e46fb1c4eb3830350bb` |
| PlatformIO Core | 6.2.0 (project-local `.venv`) |
| Platform | `espressif32@6.5.0` |
| Arduino core | `framework-arduinoespressif32@3.20014.231204` (2.0.14) |
| RISC-V toolchain | `8.4.0+2021r2-patch5` |
| esptool (Python) | `tool-esptoolpy@1.40501.0`; flashing uses 5.7.0 `--no-stub` |
| LovyanGFX | 1.2.21 |
| ArduinoJson | 7.4.3 |
| Python / Pillow (preview) | 3.14.4 / 12.1.1 |

`firmware/platformio.ini` is the single source of the build flags; `firmware/platformio.local.ini`
is git-ignored and only carries local proxy settings, never source changes.

## 2. Commands

```sh
# Bridge (reproducible install from the lock)
cd bridge && npm ci

# Quality gate
scripts/qa.sh --coverage

# Firmware release (from the repository root)
cd firmware && ../.venv/bin/pio run -e supermini

# Artifact identity
sha256sum firmware/.pio/build/supermini/firmware.bin
```

A clean build on 2026-11-26 for the Phase 4.1 fix produced
`2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` (411 232 B); rebuilding the same
tree and flags reproduced the same hash. Rebuilding `c39b1fa` (Phase 4 source) produced a binary of
the same size (410 656 B) but a different hash (`d946c29a…` vs the archived `741dcb5b…`), so the
archived Phase 4 image is **not bit-reproducible** from that commit in this workspace. The difference
is consistent with build-path/embedded metadata; it was not bisected.

Conclusion: the **procedure** is reproducible; the **bytes** are reproducible for the same tree and
workspace, not guaranteed across paths or archive times. Release identity is therefore the recorded
SHA-256 of the exact artifact, verified on the device read-back.

## 3. Artifact storage

- Build output: `firmware/.pio/build/supermini/firmware.bin` (not tracked).
- Release archives: `.backups/<phase>-<date>/` (not tracked) with `sha256` recorded in the phase
  report. The Phase 4.1 release, the Phase 4 image and the full flash backup are preserved there.
- No diagnostic image is stored in the source tree; probe/lab builds are temporary and rebuilt from
  the local commits plus the documented patch.
- The bridge is distributed as source + `package-lock.json`; there is no binary bundle in Phase 5.

## 4. Environment caveats (verified in this workspace)

- The PlatformIO registry may be unreachable behind the corporate proxy; cached packages under
  `~/.platformio` and `firmware/.pio/libdeps` were used. TLS verification is never disabled.
- Native `serialport` bindings compile at `npm ci`; the Node ABI must match (Node 24 here).
- The preview requires Pillow; it is a development tool, not part of the device build.
- The firmware build is deterministic in this workspace; a different PlatformIO home or package
  cache can change the embedded paths and therefore the hash.

## 5. Verification checklist before a release

1. `git status` clean; HEAD recorded.
2. `scripts/qa.sh --firmware` passes; test counts and coverage recorded.
3. The firmware hash and size are recorded in the phase report and match the flashed read-back.
4. The SBOM matches `package-lock.json`.
5. The cold-boot and soak gates are complete (not yet for Phase 5; see the phase report).
