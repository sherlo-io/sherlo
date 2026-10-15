#!/usr/bin/env bash
set -euo pipefail

# The test suites run in CI (GitHub Actions sets CI=true) or on demand via the
# manual_tests.yml workflow. Automated local check runs set
# ALLOW_LOCAL_TEST_EXEC=1 themselves; nobody sets it by hand.
if [ "${CI:-}" = "true" ] || [ "${ALLOW_LOCAL_TEST_EXEC:-}" = "1" ]; then
  exit 0
fi

# Related mode: a run handed exact file paths (the tests a change reaches) is
# admitted. A flag, a folder or a path that is not a file is not.
if [ "$#" -gt 0 ]; then
  related=true
  for path in "$@"; do
    if [ ! -f "$path" ]; then related=false; fi
  done
  if [ "$related" = true ]; then exit 0; fi
fi

echo "Tests run in CI, not locally by default." >&2
echo "Dispatch them on GitHub Actions:" >&2
echo >&2
echo "  gh workflow run manual_tests.yml -f package=cli|react-native-storybook|both -f path_filter=... -f test_name=..." >&2
echo "  gh run watch" >&2
exit 1
