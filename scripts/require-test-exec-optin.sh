#!/usr/bin/env bash
set -euo pipefail

# The test suites run in CI (GitHub Actions sets CI=true) or on demand via the
# manual_tests.yml workflow. To run them on your own machine, set
# ALLOW_LOCAL_TEST_EXEC=1.
if [ "${CI:-}" = "true" ] || [ "${ALLOW_LOCAL_TEST_EXEC:-}" = "1" ]; then
  exit 0
fi

echo "Tests run in CI, not locally by default." >&2
echo "Dispatch them on GitHub Actions:" >&2
echo >&2
echo "  gh workflow run manual_tests.yml -f package=cli|react-native-storybook|both -f path_filter=... -f test_name=..." >&2
echo "  gh run watch" >&2
echo >&2
echo "Or run locally by opting in:" >&2
echo >&2
echo "  ALLOW_LOCAL_TEST_EXEC=1 yarn test" >&2
exit 1
