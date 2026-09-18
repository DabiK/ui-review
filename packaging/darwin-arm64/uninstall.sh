#!/bin/sh
# UI Review bridge remover for macOS (Apple Silicon).
#
# Removes the Native Messaging host registration, the launcher and the installed executable.
# Persisted review sessions under ~/Library/Application Support/ui-review/sessions are kept.
set -eu

MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.dabik.ui_review_bridge.json"
APP_DIR="$HOME/Library/Application Support/ui-review/bridge"

REMOVED=0
if [ -f "$MANIFEST" ]; then
  rm -f "$MANIFEST"
  echo "Removed manifest: $MANIFEST"
  REMOVED=1
fi
if [ -d "$APP_DIR" ]; then
  rm -rf "$APP_DIR"
  echo "Removed bridge:   $APP_DIR"
  REMOVED=1
fi

if [ "$REMOVED" -eq 0 ]; then
  echo "Nothing to remove."
else
  echo "Review sessions were kept under ~/Library/Application Support/ui-review/sessions."
  echo "Reload the UI Review extension so the side panel sees the bridge as absent."
fi
