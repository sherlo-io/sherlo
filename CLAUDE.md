# CLAUDE.md - Sherlo

Public monorepo for Sherlo's React Native SDK. Two published packages live in `packages/`: `cli` (`@sherlo/cli`) and `react-native-storybook` (`@sherlo/react-native-storybook`).

**Start here**: Read `README.md` for what Sherlo does and how the SDK is used.

This repository is public - anything committed here (workflows, scripts, docs) is visible to external contributors, so it must never reference internal-only infrastructure.

## Test Execution

There is no root `test` script in this repo. The unit suites are per-package (both vitest), each invoked via that package's own `yarn test`:

- `packages/cli/` - CLI unit tests
- `packages/react-native-storybook/` - SDK unit tests

Each package's `test` script is guarded by `../../scripts/require-test-exec-optin.sh`, which refuses to run unless `CI=true` (set automatically on GitHub Actions) or `ALLOW_LOCAL_TEST_EXEC=1`. To run a suite on your own machine, set the local override:

```bash
ALLOW_LOCAL_TEST_EXEC=1 yarn test   # run from packages/cli or packages/react-native-storybook
```

Otherwise the suites run on GitHub Actions - automatically on pull requests via `.github/workflows/pr_checks.yml`, and on demand via `.github/workflows/manual_tests.yml`:

```bash
gh workflow run manual_tests.yml -f package=cli|react-native-storybook|both -f path_filter=... -f test_name=...
gh run watch
```

`path_filter` is one or more space-separated vitest path substrings and `test_name` is a vitest `-t` title pattern; leave either empty to run the whole suite.
