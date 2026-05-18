#!/bin/bash
# Patch sdk-compatibility.json to require an impossibly high native version,
# so checkSdkCompatibility() detects a mismatch and emits ERROR_SDK_COMPATIBILITY.
set -e

SDK_COMPAT_PATH="node_modules/@sherlo/react-native-storybook/dist/sdk-compatibility.json"
SDK_COMPAT_BACKUP="${SDK_COMPAT_PATH}.bak"

if [ ! -f "$SDK_COMPAT_PATH" ]; then
  echo "ERROR: $SDK_COMPAT_PATH not found. Run yarn install first." >&2
  exit 1
fi

# Save original so cleanup.sh can restore it.
cp "$SDK_COMPAT_PATH" "$SDK_COMPAT_BACKUP"

printf '{"REQUIRED_MIN_NATIVE_VERSION":"999.0.0","JS_MODULE_VERSION":"999.0.0"}' > "$SDK_COMPAT_PATH"
echo "Patched $SDK_COMPAT_PATH to require native version 999.0.0"
