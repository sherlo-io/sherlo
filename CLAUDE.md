# CLAUDE.md - Sherlo

Public monorepo for Sherlo's React Native SDK. Two published packages live in `packages/`: `cli` (`@sherlo/cli`) and `react-native-storybook` (`@sherlo/react-native-storybook`).

**Start here**: Read `README.md` for what Sherlo does and how the SDK is used.

This repository is public - anything committed here (workflows, scripts, docs) is visible to external contributors, so it must never reference internal-only infrastructure.

## Test Execution

Each package's unit suite (`yarn test` in `packages/cli` and `packages/react-native-storybook`, both vitest) runs on GitHub Actions - on PRs via `.github/workflows/pr_checks.yml`, and on demand via `.github/workflows/manual_tests.yml`:

```bash
gh workflow run manual_tests.yml -f package=cli|react-native-storybook|both -f path_filter=... -f test_name=...
gh run watch
```

`path_filter` is one or more space-separated vitest path substrings and `test_name` is a vitest `-t` title pattern; leave either empty to run the whole suite.

Each package's `test` script is prefixed with `scripts/require-test-exec-optin.sh`, which refuses to run unless `CI=true` (set automatically on GitHub Actions) or `ALLOW_LOCAL_TEST_EXEC=1`. Automated/agent sessions must run the suites through Actions and must not set `ALLOW_LOCAL_TEST_EXEC` - it is a local opt-in for a human running the tests on their own machine.
