# Phase 6 — Packaging and team pilot

## Objective

Let another developer install, flash, use and remove OpenCode Buddy without assistance, then run a small internal pilot.

## Technical scope

- Windows and Linux installers/scripts; macOS where practical.
- Firmware flashing guide with a verified restore path.
- Release packaging with checksums and version metadata.
- User, administrator and troubleshooting documentation.
- Optional enclosure documentation.
- Pilot with a small team, feedback loop, release notes.

## Implementation checklist

- [ ] Linux installer: user service, config scaffolding, uninstall.
- [ ] Windows installer: per-user startup, config scaffolding, uninstall.
- [ ] `buddy doctor` packaging and first-run experience.
- [ ] Flashing guide: build, upload, verify, restore previous firmware.
- [ ] Plugin enablement flow that prints the exact configuration diff before writing.
- [ ] Release artefacts with checksums and SBOM.
- [ ] User guide, admin guide, troubleshooting update.
- [ ] Enclosure model and assembly notes (optional).
- [ ] Pilot with 3–5 developers; collect structured feedback.
- [ ] Release notes and version tag.

## Dependencies

Phase 5 sign-off. Code-signing or packaging policy, if required by the organisation.

## Acceptance criteria

- A pilot user completes install, flash, first run and uninstall using only the documentation.
- Installer never modifies configuration without showing the change and asking.
- No blocker reported in the pilot; issues triaged with owners.
- Rollback to the reference firmware verified once per platform.

## Testing requirements

- Clean-machine install on Windows and Linux.
- Upgrade and downgrade path test.
- Uninstall leaves no service, plugin entry or orphan file.
- Documentation walkthrough by someone who did not write it.

## Expected deliverables

- Installers and scripts.
- Release bundle, checksums, SBOM.
- Final documentation set.
- Pilot report and release notes.

## Gate

Pilot acceptance and release approval.
