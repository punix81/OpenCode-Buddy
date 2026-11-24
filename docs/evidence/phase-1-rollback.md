# Phase 1 rollback evidence

Date: 2026-11-24
Device: ESP32-C3 rev v0.4, 4 MB flash (serial redacted)

## Backup taken before flashing

- Port: `/dev/ttyACM0`
- Command: `esptool --no-stub --after no-reset read-flash 0x0 0x400000 full-flash.bin`
- Tool: esptool 5.7.0 (esptool 4.5.1 could not complete this read; see below)
- Size: 4 194 304 bytes
- SHA-256: `9a83841f558517bd9eb4e6c67a0daa483b36fe3ed0e31de3b1e9e0735bd07479`

### Integrity checks

| Check | Result |
| --- | --- |
| Partition table at `0x8000` vs reference build | identical (SHA-256 `148b959c…0653a1`) |
| Bootloader at `0x0` (13 200 B) vs reference build | identical (`b800a76c…0ec32e`) |
| Application at `0x10000` (860 304 B) vs reference build | identical (`1ba423fa…3f3fa7`) |
| Lower 2 MB vs independent 64 KB block read (esptool 4.5.1) | byte-for-byte identical |
| Bootloader image magic at `0x0` | `e9` valid, plaintext (flash encryption not blocking) |

The device was identified as ESP32-C3, 4 MB, before any write. The reference project was not modified.

## Flash of OpenCode Buddy

- Scope: application only, `write-flash 0x10000 firmware.bin`.
- Written: 385 904 bytes (instrumented build at the time).
- esptool verified the written data (hash matched) and reset the board.
- The bootloader, partition table, otadata and NVS were deliberately left untouched.

## Restore

- Command: `.backups/phase1-2026-11-24/restore.sh /dev/ttyACM0`
- Write: `write-flash 0x0 full-flash.bin` (all 4 194 304 bytes)
- Verification: `verify-flash 0x0 full-flash.bin` → **digest matched**
- The checksum file was first corrected to be relative to the backup directory; the initial attempt
  aborted before writing anything.
- After the reset, the device re-enumerated on `/dev/ttyACM0`.
- The reference bridge was restarted with its original manual command
  (`python3 -u bridge.py --port /dev/ttyACM0`, working directory `Codex-Quota-Mini`); it owns the port
  and its log contains no error lines.
- The systemd unit `codex-quota-bridge.service` remains stopped and enabled, matching the state
  before the session.

## Reference UI confirmation

The image restore is verified byte for byte. Human confirmation that the reference Codex Quota screen
displays its pages and data is **pending**; it must not be reported as verified until observed.

## Why esptool 4.5.1 was not used

- The stub re-enumerated the USB CDC and the tool lost the port.
- The ROM reader failed deterministically at the 2 MB boundary with a CRC error.
- esptool 5.7.0 with `--no-stub` read and wrote the full 4 MB reliably.

## Residual risk

A power loss during a full 4 MB write can leave the device unbootable. The verified dump remains
available for another attempt. No full-chip erase was performed at any point.

## Post-rollback state (same day)

After the verified restore, the Product Owner reported a problem, then confirmed it was a mistake and
asked to re-flash OpenCode Buddy. The application was written again at `0x10000` (385 984 B, SHA-256
`35d69a86…100009da`, verified by esptool) and boots normally. The reference bridge remains stopped.

The rollback was therefore **demonstrated and verified**, and Buddy was then re-applied at the
Product Owner's request. The 4 MB dump and the restore script remain available; restoring the
reference again is a single command.
