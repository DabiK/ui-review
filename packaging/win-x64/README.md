# UI Review bridge — Windows x64

Standalone companion for the UI Review Chrome extension. It stores session artifacts under
`%APPDATA%\ui-review` and materializes agent handoff folders in the system temporary
directory. It speaks Native Messaging on stdin/stdout and never opens a network port. The
binary embeds its own runtime: no Node.js installation is required.

## Requirements

- 64-bit Windows 10 or later.
- Google Chrome (stable channel). Other Chrome channels need their own registry key; see
  "Platform notes".
- PowerShell 5.1 or later (included in Windows 10/11).

## Install

1. Unpack this folder somewhere the current user can read.
2. Open `chrome://extensions`, enable Developer mode and read the **ID** of the UI Review
   extension (32 letters, a–p).
3. Run the installer from PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId <extension-id>
   ```

   It copies the executable to `%APPDATA%\ui-review\bridge`, writes the launcher that pins
   the extension origin, writes the host manifest next to it and registers
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dabik.ui_review_bridge`.
4. In `chrome://extensions`, press **Reload** on the UI Review extension.
5. Open the side panel: the Agent handoff block should show **Local bridge ready**.
   If it still reports a missing bridge, choose **Check again**.

## Health check

```powershell
& "$env:APPDATA\ui-review\bridge\ui-review-bridge.exe" --health
```

It prints one JSON line with the bridge version, protocol version and platform, and exits 0.
The bridge refuses to serve without the launcher's allowed-origin environment variable, so a
mismatched manual launch fails closed.

## Remove

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

It removes the registry key, the host manifest, the launcher and the installed executable.
Persisted review sessions under `%APPDATA%\ui-review\sessions` are kept. Reload the extension
afterwards; the side panel will then offer the setup state again.

## Platform notes

- Only Chrome stable is registered (`HKCU\Software\Google\Chrome\NativeMessagingHosts`). For
  Chrome Beta/Dev/Canary, register the same manifest path under the matching vendor key
  (`Google\Chrome Beta`, `Google\Chrome Dev`, `Google\Chrome SxS`).
- The host manifest must live outside Program Files for the user-level registry key to be
  honored consistently; `%APPDATA%\ui-review\bridge` satisfies that.
- Windows may show a SmartScreen warning for unsigned executables. Choose "More info" →
  "Run anyway", or sign the artifact with your own certificate.
- The packaged binary is large (about 110 MiB) because it embeds the Node runtime that runs
  the bridge. That is expected and is the reason no Node installation is needed.
