# Phase 6B Windows audit

Audit date 2026-11-27. Starting commit 623714d. Git object verification produced
no errors. Six pre-existing npm peer metadata edits in the lockfile were kept
outside the implementation changes.

| ID | Severity | Evidence | Disposition |
| --- | --- | --- | --- |
| W-01 | P0 | The original uninstaller recursively removed any supplied installation prefix, including unrelated files. Source inspection confirmed the deletion boundary. | Uninstall selects the recorded app and launchers. An isolated Windows fixture retained an unrelated file, provider/MCP data, comments, plugins and backups. |
| W-02 | P1 | A native pipe created by the Phase 6A Node listener exposed Everyone and Anonymous read entries. Best-effort token-file ACL changes did not change that pipe DACL. | The Windows host creates a current-user-only pipe with remote clients rejected and publishes the descriptor after binding. See [Windows IPC evidence](evidence/phase-6-windows-ipc.md). |
| W-03 | P1 | The native package build failed with spawnSync npm.cmd EINVAL. The archived installer also pointed OpenCode at the extraction directory rather than the installed plugin. | The build invokes the fixed npm command via cmd.exe. The installer references the installed plugin and stages the app before replacement. |
| W-04 | P1 | The plugin installer dry run printed the entire merged configuration, which can contain sensitive data. An explicit unreadable Buddy configuration could silently become defaults and re-enable discovery. | Dry run prints the intended plugin edit only. Explicit or unreadable configurations fail with a configuration error. |
| W-05 | P2 | SerialPort reported the Windows composite interface instance tail as the USB serial. PnP reported a different serial on its USB parent. | Resolve the Espressif parent through Windows Configuration Manager. Use an explicit port when no stable serial is available. |
| W-06 | P2 | Windows tests used POSIX permission bits, PID 1 and Linux paths built with the host separator. | The PowerShell gate runs real Windows ACL/pipe checks and keeps Unix-only filesystem assertions in the Unix gate. Startup definitions use target-platform path syntax. |
| W-07 | P2 | The preserved firmware files referenced by the historical handover are absent from this Windows checkout. | The manifest and historical records are available. Transfer the original files and verify size and digest before any flash campaign. |
| W-08 | P3 | The Windows ZIP and PowerShell wrapper were described alongside a possible installer format. | The tested artifact is a portable ZIP with a user-scope PowerShell wrapper. Windows source build uses the .NET Framework compiler for the bundled pipe host. |

**NATIVE VERIFIED** Windows 11 Home x64, build 26300.10075, Windows PowerShell
5.1.26100.10068, Node 24.13.0 x64 (ABI 137), npm 11.6.2, Git 2.54.0.windows.1
and OpenCode npm CLI 2.4.2. Python 3.11.7, PlatformIO 6.1.19 and esptool 4.11.0
are available from the existing PlatformIO installation. WinHTTP reported direct
access. SerialPort 13.0.0 enumerated the native Windows ports from the installed ZIP.

**AUTOMATED** The shared handshake gate requires both ready and config
acknowledgements before state or MCP frames. The firmware sources, visual
renderer and frozen manifest were not changed.

**BLOCKER** The owner-selected port denied exclusive access during the initial
probe. The pre-existing Buddy bridge held the default runtime lock. A driver
access error and a process lock do not by themselves prove handle ownership.
