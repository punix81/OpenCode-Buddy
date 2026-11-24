# Security Policy

OpenCode Buddy is designed for professional environments, including restricted ones. It is a local
peripheral: it must never become a data exfiltration path or a remote control channel.

## Reporting a vulnerability

Do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability).
Include: affected component, version or commit, reproduction steps, impact, and whether sensitive
data could be exposed. You will receive an acknowledgement, an assessment, and a coordinated
disclosure date.

## Security model (summary)

| Property | Rule |
| --- | --- |
| Data direction | OpenCode → plugin → bridge → device. The device sends gestures and protocol control only. |
| Device authority | None. No permission approval, no command execution, no file access, no configuration change. |
| Network | No Wi-Fi, no Bluetooth, no listening socket on non-loopback interfaces, no telemetry. |
| Payload | Allowlisted normalized state and counters. Never prompts, responses, code, tool arguments, file contents, absolute paths, credentials or tokens used for authentication. |
| Secrets | None stored in the repository; none transmitted to the device. |
| Persistence | Local metrics persistence disabled by default; logs sanitized and rotated. |
| Failure mode | Losing the device, the bridge or the plugin must not block or slow OpenCode. |

Details and the field allowlist: [docs/security.md](docs/security.md).

## Supported versions

Security fixes target the latest released minor. Before the first release, security fixes target
`main`.

## Dependency policy

New dependencies require: a clear justification, a licence compatible with this project, an active
maintenance signal, and no hidden network calls. A dependency audit runs in Phase 5 and before any
release. Report a suspected dependency issue through the private channel above.
