# UI Review bridge — macOS (Apple Silicon)

Standalone companion for the UI Review Chrome extension. It stores session artifacts under
`~/Library/Application Support/ui-review` and materializes agent handoff folders in the
system temporary directory. It speaks Native Messaging on stdin/stdout and never opens a
network port. The binary embeds its own runtime: no Node.js installation is required.

## Requirements

- macOS on Apple Silicon (arm64). macOS 12 or later.
- Google Chrome (stable channel). Other Chrome channels need their own `NativeMessagingHosts`
  directory; see "Platform notes".

## Install

1. Unpack this folder somewhere the current user can read.
2. Open `chrome://extensions`, enable Developer mode and read the **ID** of the UI Review
   extension (32 letters, a–p).
3. Run the installer:

   ```sh
   ./install.sh --extension-id <extension-id>
   ```

   It copies the executable to `~/Library/Application Support/ui-review/bridge`, writes the
   launcher that pins the extension origin, registers
   `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.dabik.ui_review_bridge.json`
   and prints a health check.
4. In `chrome://extensions`, press **Reload** on the UI Review extension.
5. Open the side panel: the Agent handoff block should show **Local bridge ready**.
   If it still reports a missing bridge, choose **Check again**.

## Health check

```sh
~/Library/Application Support/ui-review/bridge/ui-review-bridge --health
```

It prints one JSON line with the bridge version, protocol version and platform, and exits 0.
The bridge refuses to serve without the launcher's allowed-origin environment variable, so a
mismatched manual launch fails closed.

## Remove

```sh
./uninstall.sh
```

It removes the host manifest, the launcher and the installed executable. Persisted review
sessions under `~/Library/Application Support/ui-review/sessions` are kept. Reload the
extension afterwards; the side panel will then offer the setup state again.

## Platform notes

- Only Chrome stable is registered. For Chrome Beta/Canary, copy the manifest into the
  matching `~/Library/Application Support/Google/Chrome <channel>/NativeMessagingHosts/`
  directory.
- The executable is ad-hoc signed at packaging time. If macOS quarantines it after a
  download, the installer removes the quarantine attribute; if you launch it by hand, run
  `xattr -d com.apple.quarantine <path>` first.
- The packaged binary is large (about 110 MiB) because it embeds the Node runtime that runs
  the bridge. That is expected and is the reason no Node installation is needed.
