#!/bin/bash
#
# Repack the SDK into both testing apps, and refresh their lockfiles.
#
#   1. Builds the SDK, so the tarball carries this commit's compiled code.
#   2. Packs it: the SDK's prepack lays in the pinned core
#      (packages/react-native-storybook/sherlo-core.json) from package storage.
#   3. Puts the tarball in testing/expo/sherlo-lib and testing/react-native/sherlo-lib.
#   4. Installs each testing app, so its yarn.lock records the new tarball's checksum.
#
# Commit both tarballs and both lockfiles together. Needs PACKAGE_TOKEN.
#
# Usage:
#   yarn pack:testing-apps
#
set -euo pipefail

if [ -z "${PACKAGE_TOKEN:-}" ]; then
  echo "Error: PACKAGE_TOKEN is not set. The SDK's pack fetches the pinned core with it." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="$REPO_ROOT/packages/react-native-storybook"
EXPO_TARBALL="$REPO_ROOT/testing/expo/sherlo-lib/react-native-storybook.tgz"
REACT_NATIVE_TARBALL="$REPO_ROOT/testing/react-native/sherlo-lib/react-native-storybook.tgz"

echo "Building the SDK..."
(cd "$SDK_DIR" && yarn build)

echo "Packing the SDK into both testing apps..."
mkdir -p "$(dirname "$EXPO_TARBALL")" "$(dirname "$REACT_NATIVE_TARBALL")"
(cd "$SDK_DIR" && yarn pack --out "$EXPO_TARBALL")
cp "$EXPO_TARBALL" "$REACT_NATIVE_TARBALL"

echo "Installing testing/expo..."
(cd "$REPO_ROOT/testing/expo" && yarn install)

echo "Installing testing/react-native..."
(cd "$REPO_ROOT/testing/react-native" && yarn install)

echo "Packed the SDK into testing/*/sherlo-lib/react-native-storybook.tgz and refreshed both lockfiles."
