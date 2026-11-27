# Phase 6B Windows IPC evidence

**NATIVE VERIFIED** On Windows 11 x64, a separate local fixture using the Phase
6A Node pipe was inspected with the .NET pipe client on 2026-11-27. Its DACL
granted Everyone and Anonymous read access. The production replacement's actual
pipe DACL granted access to the current user SID only, as did the runtime
directory, token file and descriptor inspected by the Windows test.

The Win32 host creates the pipe with a protected DACL, non-inheritable handles,
first-instance protection and PIPE_REJECT_REMOTE_CLIENTS. The runtime
directory ACL is checked before writing credentials. Credentials are published
after binding. There is no TCP fallback. The shared parser owns token
authentication, peer limits and event normalization. The bridge reclaims its
runtime after a process crash, and the pipe host exits when inherited stdin closes.

**AUTOMATED on Windows** The native suite exercises valid and invalid tokens,
hello-first enforcement, multiple peers, disconnect handling, descriptor cleanup,
duplicate instance rejection, crash recovery and token rotation.

**NATIVE VERIFIED** An OpenCode CLI 2.4.2 standalone session loaded the Buddy
plugin from its project configuration and passed real events to a LiveSource
through the secure pipe. The observation included connection and offline
transitions, one session start, one execution start and successful completion,
four usage events, model/agent fields, one successful read-only tool, and MCP
counts. An active background OpenCode service was left running.

At 22:30 CET a repeat aggregate capture recorded thinking, generating,
session-close events, and MCP 4 online of 13. The capture path ended at the
bridge with no serial transport attached.

**PARTIALLY VERIFIED** Local-only behavior is enforced at Win32 creation and
verified in source. Cross-user isolation is evidenced by the actual DACL.
No second interactive Windows account or remote SMB client was used in this
checkpoint. Keep both as pilot verification cases when those facilities exist.

Native API reference:
[Named pipe security](https://learn.microsoft.com/windows/win32/ipc/named-pipe-security-and-access-rights)
and [CreateNamedPipe](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-createnamedpipea).
