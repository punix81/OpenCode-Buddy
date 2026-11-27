# Phase 5 — preserved artifacts (verified 2026-11-27)

All artifacts are outside the build trees. Hashes were recomputed in this session with `sha256sum`;
the sizes are bytes. Nothing listed here was deleted or rewritten.

| Artifact | SHA-256 | Size | Location |
| --- | --- | --- | --- |
| Phase 4.1 application | `2ff67b7180779354d785b07efd758920892cd0f381ab6ed3519c3fffee88caa2` | 411 232 | `.backups/phase4-2026-11-26/firmware-phase4-1-release-2ff67b71.bin` |
| RC1 (frozen) | `dd7d1d5727ae1e36e0a799fe248ea42f66d831593e5f0a5538b2196b287cce63` | 413 344 | `.backups/phase5-rc-2026-11-27/firmware-rc-dd7d1d57.bin` |
| RC1 clean rebuild (code/data-identical) | `f9cc72eeb7b9f424ebb052c488e0d8d6e52a50fe4993d1279d214e42b2292ec8` | 413 344 | `.backups/phase5-rc-final-2026-11-27/firmware-rc-repro-f9cc72ee.bin` |
| Full flash before first diagnostic | `c58f4cca6a1eb973acd757c54ec93e01bf3e96e724663d4a106c23a250da17bd` | 4 194 304 | `.backups/phase5-diag-2026-11-27/full-before-c58f4cca.bin` |
| Full flash before fix2 | `25c1d7ffd28d28031b976e27daa57882ec7f26924bafd9e5b0f2f8af970fada9` | 4 194 304 | `.backups/phase5-diag-2026-11-27/full-before-25c1d7ff.bin` |
| Pre-Phase 4 full flash (historical) | `70d918e7aa799392f439178ff150bc63944b44f1fdc3cb72bc7a8ee189119011` | 4 194 304 | `.backups/phase4-2026-11-26/full-flash-pre-phase4.bin` |
| Diagnostic `3646d4ce` | `3646d4ce6986f5993f395738cdf9998a48ade04138cc4ac0c38119600ab5bb32` | 415 408 | `.backups/phase5-rc-2026-11-27/firmware-diag-live-3646d4ce.bin` |
| Diagnostic `ad4039ac` | `ad4039acc5f3861ec41028c5a828062cf9d85b8b1ecfc8feebd19176121ab322` | 416 592 | `.backups/phase5-diag-2026-11-27/firmware-diag-live-fixed-ad4039ac.bin` |
| Diagnostic `af390f71` | `af390f71864840fc61c252726f9d5fdda1dcfe01b3d6bb2430d896ab69eac7d6` | 416 704 | `.backups/phase5-diag-2026-11-27/firmware-diag-live-prelink-af390f71.bin` |
| Diagnostic `fix3` `3689b828` | `3689b828d372df6cc36a75994f5cc85c62e5f3636ed50b912d0f4d222803e34b` | 416 704 | `.backups/phase5-diag-2026-11-27/firmware-diag-live-fix3-3689b828.bin` |
| Diagnostic `fix4` `0b57ca8c` | `0b57ca8c9c6b6a4c234e69975838a987466fde32c4c4c1d118ed96a698d9e9d8` | 416 624 | `.backups/phase5-diag-2026-11-27/firmware-diag-live-fix4-0b57ca8c.bin` |
| MOCK bench `e4aeb6f9` | `e4aeb6f9a3b4bb4d7ead9749331b4ccde108df038d5d95946b02a22e60a99cc6` | 418 000 | `.backups/phase5-diag-2026-11-27/firmware-diag-bench-prelink-e4aeb6f9.bin` |

`RC1` and the rebuild differ only in the embedded ELF SHA and the image validation hash; a byte
comparison of the code/data region shows 0 differences (413 344 B each).

The full backups preserve bootloader, partitions and NVS. The application-only writes never touched
those regions. The rollback target is exclusively `2ff67b71…`, never `741dcb5b…`.

Historical failure evidence remains in `docs/evidence/phase-5-usb-diagnostics.md`,
`docs/evidence/phase-5-hardware-validation.md`, `docs/phase-5-report.md` and the original Phase 4/4.1
reports. No diagnostics log is committed; the reports retain the measured counters and the reasons.
