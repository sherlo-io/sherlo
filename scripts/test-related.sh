#!/usr/bin/env bash
set -euo pipefail

# Runs the unit tests of packages/cli and packages/react-native-storybook that reach the files
# handed in (paths from the repository root, or absolute). A package none of the files is in runs
# nothing. Each package's own runner does the work, in its related mode.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for package in cli react-native-storybook; do
  files=()
  for file in "$@"; do
    relative="${file#"$root"/}"
    case "$relative" in
      packages/"$package"/*)
        inside="${relative#packages/"$package"/}"
        # A deleted file has nothing to reach from.
        if [ -f "$root/packages/$package/$inside" ]; then files+=("$inside"); fi
        ;;
    esac
  done
  if [ "${#files[@]}" -eq 0 ]; then continue; fi

  cd "$root/packages/$package"
  ../../scripts/require-test-exec-optin.sh "${files[@]}"
  npx vitest related --run "${files[@]}"
done
