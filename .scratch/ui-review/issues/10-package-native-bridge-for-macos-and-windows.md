# 10 — Package and install the bridge on macOS and Windows

**Blocked by:** #5  
**Labels:** `area:bridge`, `area:release`, `ready-for-agent` after #5

## Outcome

Make the local bridge realistically installable by a reviewer on macOS Apple Silicon and Windows x64 without requiring a Node.js runtime.

## Scope

- Produce standalone bridge artifacts for macOS Apple Silicon and Windows x64.
- Generate the OS-specific Native Messaging host manifest and installer/uninstaller steps.
- Detect bridge absence/version mismatch from the extension and show an actionable non-technical setup state.
- Add release checks that verify artifact naming, manifest path and protocol compatibility.
- Document known platform restrictions and recovery steps.

## Acceptance criteria

- [ ] A clean macOS Apple Silicon machine can install, health-check and remove the bridge using documented steps.
- [ ] A clean Windows x64 machine has equivalent documented install, health-check and removal steps.
- [ ] The extension gives a clear recovery action when no compatible bridge is found.
- [ ] No Node.js runtime is required after installation.
- [ ] Release checks validate both target manifests.

## Review focus

Review installer paths and removal behavior separately on each OS; never leave an orphaned Native Messaging registration.

