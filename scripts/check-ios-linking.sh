#!/usr/bin/env bash
# Checks that the SDK is linked into the debug iOS configurations only, by the Podfile-driven
# linking config: the testing app as it is, then with its configurations renamed dev.debug and
# dev.release. Runs pod install twice and compiles nothing; needs macOS with CocoaPods and the
# testing app's node_modules. The files it changes are restored when it ends.
set -euo pipefail

unset SHERLO_BUILD
export LANG=en_US.UTF-8

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$REPO_ROOT/testing/react-native/ios"
XCODEPROJ="testing/react-native/ios/SherloRNExample.xcodeproj"
PBXPROJ="$XCODEPROJ/project.pbxproj"
SCHEME="$XCODEPROJ/xcshareddata/xcschemes/SherloRNExample.xcscheme"
PODFILE="testing/react-native/ios/Podfile"
PODFILE_LOCK="testing/react-native/ios/Podfile.lock"
XCCONFIG_DIR="$IOS_DIR/Pods/Target Support Files/Pods-SherloRNExample"
LIBRARY='-l"sherlo-react-native-storybook"'

# The four files the check changes are copied aside first and copied back when it ends, so a
# developer's own edits to them survive a run on their Mac.
CHANGED_FILES=("$PBXPROJ" "$SCHEME" "$PODFILE" "$PODFILE_LOCK")
BACKUP_DIR="$(mktemp -d)"
for file in "${CHANGED_FILES[@]}"; do
  mkdir -p "$BACKUP_DIR/$(dirname "$file")"
  cp "$REPO_ROOT/$file" "$BACKUP_DIR/$file"
done

restore() {
  for file in "${CHANGED_FILES[@]}"; do
    cp "$BACKUP_DIR/$file" "$REPO_ROOT/$file"
  done
  rm -rf "$BACKUP_DIR"
}
trap restore EXIT

# The testing app installs the SDK from a packed tarball, which holds the linking config of the
# commit it was packed at. The check is about this commit's config, so lay it over the installed
# copy before pod install runs it.
cp "$REPO_ROOT/packages/react-native-storybook/react-native.config.js" \
  "$REPO_ROOT/testing/react-native/node_modules/@sherlo/react-native-storybook/react-native.config.js"

assert_linked() {
  local configuration="$1" expected="$2"
  local file="$XCCONFIG_DIR/Pods-SherloRNExample.$configuration.xcconfig"
  local found=no
  if [ -f "$file" ] && grep -qF -- "$LIBRARY" "$file"; then found=yes; fi
  if [ "$found" != "$expected" ]; then
    echo "FAIL $configuration: expected SDK linked=$expected, found linked=$found"
    echo "file: $file"
    echo "grep sherlo:"
    grep -n -i sherlo "$file" || echo "(no sherlo lines, or no file)"
    exit 1
  fi
  echo "PASS $configuration (SDK linked: $found)"
}

echo "== testing app as it is =="
(cd "$IOS_DIR" && pod install)
assert_linked debug yes
assert_linked release no

echo "== configurations renamed dev.debug / dev.release =="
cd "$REPO_ROOT"
sed -i '' -e 's/name = Debug;/name = dev.debug;/' -e 's/name = Release;/name = dev.release;/' \
  -e 's/defaultConfigurationName = Release;/defaultConfigurationName = dev.release;/' "$PBXPROJ"
sed -i '' -e 's/buildConfiguration = "Debug"/buildConfiguration = "dev.debug"/' \
  -e 's/buildConfiguration = "Release"/buildConfiguration = "dev.release"/' "$SCHEME"
sed -i '' "/^prepare_react_native_project!/a\\
project 'SherloRNExample', 'dev.debug' => :debug, 'dev.release' => :release
" "$PODFILE"
git diff --stat

(cd "$IOS_DIR" && pod install)
assert_linked dev.debug yes
assert_linked dev.release no
