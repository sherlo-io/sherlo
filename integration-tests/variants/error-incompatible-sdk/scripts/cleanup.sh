#!/bin/bash
# Restore sdk-compatibility.json from the backup saved by prepare.sh.
set -e

SDK_COMPAT_PATH="node_modules/@sherlo/react-native-storybook/dist/sdk-compatibility.json"
SDK_COMPAT_BACKUP="${SDK_COMPAT_PATH}.bak"

if [ -f "$SDK_COMPAT_BACKUP" ]; then
  cp "$SDK_COMPAT_BACKUP" "$SDK_COMPAT_PATH"
  rm "$SDK_COMPAT_BACKUP"
  echo "Restored $SDK_COMPAT_PATH from backup"
else
  echo "WARNING: No backup found at $SDK_COMPAT_BACKUP - sdk-compatibility.json may still be patched" >&2
fi
