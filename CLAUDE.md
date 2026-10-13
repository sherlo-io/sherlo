# CLAUDE.md - Sherlo

Public monorepo for Sherlo's React Native SDK. Two published packages live in `packages/`: `cli` (`@sherlo/cli`) and `react-native-storybook` (`@sherlo/react-native-storybook`).

**Start here**: Read `README.md` for what Sherlo does and how the SDK is used.

This repository is public - anything committed here (workflows, scripts, docs) is visible to external contributors, so it must never reference internal-only infrastructure.

## Type Checking

Type-check the whole repository from the root:

```bash
yarn typecheck
```

It checks `packages/cli`, `packages/react-native-storybook` and `contracts`, the same projects `.github/workflows/pr_checks.yml` checks.

## Linting

Lint the SDK and the CLI from the root:

```bash
yarn lint
```

It runs oxlint with the rules in `.oxlintrc.json` (the door rules under `packages/cli/src` included), then `prettier --check`. Each package's own `yarn lint` does the same for that package.

- The door rules (`no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`) replace ESLint's `no-restricted-syntax` selectors. oxlint has no rule that refuses `require()`, so `.oxlint/doors-plugin.js` carries that one, for `child_process`, `http`, `https` and `net`.
- `prettier --check` replaces ESLint's Prettier rule. The `react-native/*` rules of the old React Native preset, the Flow rules and the accessibility rules have no oxlint form and are dropped; none was failing.
- `jest/valid-expect` is off: vitest's `expect(value, message)` takes a second argument, which that rule warns on and the old lint never did. `no-bitwise` stays a warning, as it was.

## Test Execution

Tests and checks are fast: a test file fails past 5 seconds and a pull request check past 5 minutes; a slow one is sped up, never given a bigger limit.

There is no root `test` script in this repo. The unit suites are per-package (all vitest), each invoked via that package's own `yarn test`:

- `packages/cli/` - CLI unit tests
- `packages/react-native-storybook/` - SDK unit tests. They run against a fake core; the packaging rules read the packs `scripts/packAsPublished.js` makes with `PACKAGE_TOKEN`, a step of the pull request check, from the folder `SHERLO_SDK_PACKS` names (without it, outside CI, those rules skip)

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
