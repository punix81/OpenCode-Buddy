# Phase 6 Checkpoint B evidence

Date 2026-11-27. Baseline 623714d. **PARTIALLY VERIFIED**.

| Gate | Evidence class | Result |
| --- | --- | --- |
| Physical Windows x64 host and native dependency load | NATIVE VERIFIED | Windows 11, Node 24 x64, packaged SerialPort loaded and enumerated six ports |
| Pipe and runtime-file ACLs | NATIVE VERIFIED | Current-user SID only in actual DACL inspections |
| Native pipe lifecycle and protocol suites | AUTOMATED | Run the Windows quality gate; see [IPC evidence](phase-6-windows-ipc.md) |
| Windows ZIP, installation and reinstall | NATIVE VERIFIED | Native ZIP, checksum, user-scope wrapper, project-local config with backup, idempotent reinstall |
| Upgrade and uninstall | NATIVE VERIFIED / AUTOMATED | Fixture version upgrade replaced owned app files. Uninstall removed only owned files and the Buddy plugin entry. |
| Optional startup | NATIVE VERIFIED | Generated and removed an isolated VBS definition. Login execution remains unverified. |
| OpenCode 2.4.2 real data to bridge | NATIVE VERIFIED | Standalone real session, tool, usage, model, agent, MCP and offline transition |
| Selected USB port | BLOCKER | Exclusive COM23 access was denied. Existing bridge runtime was active. |
| Hardware display, preferences and endurance | NOT VERIFIED | Pending native link and explicitly approved campaign |
| Frozen binaries and full backups on Windows | NOT VERIFIED | Historical manifests are present; their referenced original binaries were unavailable in the checkout. |

Commands used include the PowerShell quality gate, the Windows package builder,
the packaged installer against temporary fixtures, read-only PnP enumeration, and
an isolated OpenCode standalone CLI session. No firmware source, GPIO, display
setting or protocol schema was changed. All previous reports remain historical
evidence. See the [independent audit](../audit-phase-6-windows.md).

## Windows QA results

- Bridge 138 passed, 1 Unix-filesystem check skipped on Windows.
- Plugin 30 passed. Installation scripts 15 passed.
- Coverage on Windows is 95.75% line, 86.97% branch and 85.63% function.
- Typecheck, bridge and plugin ESLint, script syntax, TypeScript build,
  configuration examples, and 12 valid / 14 invalid protocol vectors passed.
- Windows archive SHA-256
  `9f7703e3b9ba5d9e3df20aa15b433ff410bf13ea9c345b000385d64c114fe97f`.
- **NOT VERIFIED** This checkpoint did not rerun the Unix C++ host/ASan or
  graphical preview suites. The available PlatformIO Python lacked Pillow.
