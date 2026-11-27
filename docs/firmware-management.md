# Firmware management (Phase 6 design)

Date: 2026-11-27. Design only for Checkpoint A; **no flash is authorized**. The frozen RC1 image is
not modified.

## 1. Artifacts

| Artifact | SHA-256 | Size | Use |
| --- | --- | --- | --- |
| RC1 application `dd7d1d57…` | `dd7d1d5727ae1e36e0a799fe248ea42f66d831593e5f0a5538b2196b287cce63` | 413 344 B | Application-only update at `0x10000` |
| Phase 4.1 rollback `2ff67b71…` | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` | 411 232 B | Verified rollback |
| RC1 rebuild `f9cc72ee…` | `f9cc72eeb7b9f424ebb052c488e0d8d6e52a50fe4993d1279d214e42b2292ec8` | 413 344 B | Code-identical build check |

The manifest is `firmware/rc1-manifest.json`. The binary remains outside the repository
(`.backups/phase5-rc-2026-11-27/firmware-rc-dd7d1d57.bin`); packaging does not include it.

## 2. Initial installation versus application update

- **Initial installation** of a blank ESP32-C3 needs a compatible bootloader, partition table, NVS
  layout and application. RC1 is an **application-only** image; it is not sufficient for a blank
  device. A separately approved full installation artifact and procedure are required. This is a
  Checkpoint B/D decision and is not implemented here.
- **Application update** of a device already running a compatible Buddy firmware writes only the
  application at `0x10000`. Bootloader, partitions and NVS are never rewritten. This is the validated
  Phase 4.1/RC1 procedure.

## 3. Preconditions for every flash

1. Explicit Product Owner approval for that image and that device.
2. The bridge is stopped; no process owns the serial port.
3. The device identity is confirmed (USB VID/PID and MAC where available).
4. The current application is read back and hashed; the rollback image is available and verified.
5. `scripts/firmware-verify.mjs` reports OK for the target image and prints the plan.
6. A visible confirmation step (no automatic flash after discovery).

## 4. Procedure (application-only, when approved)

```sh
node scripts/firmware-verify.mjs --manifest firmware/rc1-manifest.json \
  --image <rc1.bin> --plan
# stop the bridge, verify no port owner
PYTHONPATH=/tmp/opencode/esptool-lib python -m esptool --chip esp32c3 --port <port> \
  --no-stub --after no-reset write-flash --no-compress 0x10000 <rc1.bin>
# independent read-back, SHA-256 comparison, then verify-flash --after watchdog-reset
```

The exact offset and digest come from the manifest; they must never be typed from memory. The
bridge is restarted only after the application boots and the handshake succeeds.

## 5. Rollback

The verified Phase 4.1 application `2ff67b71…` is written at `0x10000` with the same application-only
procedure, read back and hashed. The full 4 MiB backups (`c58f4cca…`, `25c1d7ff…`) preserve the
bootloader, partitions and NVS for recovery. The Phase 4 image `741dcb5b…` is never a rollback
target.

## 6. UI/CLI

The future management CLI exposes `firmware plan`, `firmware verify` and `firmware update`; the last
one requires an interactive confirmation and prints the current/target identities. It never checks a
remote server automatically. A firmware update is disabled while the bridge owns the port.

## 7. What is not implemented in Checkpoint A

- No flash, no initial full installation artifact, no hardware verification.
- No automatic update, no remote update check, no rollback button beyond the documented commands.
- Native Windows/Linux serial-port and esptool execution is a Checkpoint B/D validation.
