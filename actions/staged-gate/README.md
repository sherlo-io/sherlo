# Sherlo Staged Gate action

A composite GitHub Action that runs the Sherlo staged routing probe
(`sherlo staged:check`) and exposes the routing decision as action outputs, so a
caller workflow can route two jobs off a single gate: a JS-only fast path on
Linux, or a full native build path.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## What it does

`sherlo staged:check` is a CI routing probe, not a pass/fail gate. It runs right
after dependency install with no build artifacts, computes a source fingerprint,
asks the Sherlo gate, and decides one of three routing modes:

| `mode`           | Meaning                                                      | What to run                                        |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `fast`           | Native inputs unchanged; a registered base matches source   | `test:bundled` (JS-only, runs on Linux)            |
| `full`           | Native inputs moved since the base build                    | Native build, then `test:standard`                 |
| `not-stageable`  | Project can't use the staged path (no devices, no fingerprint) | Treat like `full`: native build, then `test:standard` |

`test:standard` registers a fresh native base, so after a `full` run the next
push with native unchanged routes `fast`.

<br />

## Usage

```yaml
uses: sherlo-io/sherlo/actions/staged-gate@v1
```

Pin to a released tag (as above) or a commit SHA in your own repository.

### Inputs

| Input               | Required | Default              | Description                                           |
| ------------------- | -------- | -------------------- | ----------------------------------------------------- |
| `sherlo-token`      | yes      | -                    | Sherlo project token (`SHERLO_TOKEN`)                 |
| `working-directory` | no       | `.`                  | Directory to run `staged:check` in (project root)     |
| `config`            | no       | `sherlo.config.json` | Path to the Sherlo config file                        |

### Outputs

| Output             | Description                                                            |
| ------------------ | --------------------------------------------------------------------- |
| `mode`             | Routing mode: `fast`, `full`, or `not-stageable`                      |
| `reason`           | Single-line human explanation of the routing decision                 |
| `base-fingerprint` | Source base fingerprint (maps the CLI's `baseFingerprint`; may be empty) |

<br />

## The exit-code trap (handled for you)

`staged:check` exits `0` = fast, `1` = full, `2` = not-stageable. The `1` and `2`
exits are expected routing outcomes, not failures - a naive gate step would fail
the whole workflow on any native change. But a genuine tool error (bad token,
network failure) also exits `1`, so the exit code alone cannot tell `full`
routing from a real error.

The reliable discriminator is the output, not the exit code: on a real routing
decision the CLI writes `mode=...` to `$GITHUB_OUTPUT` before exiting; on a
genuine error it throws and never writes `mode`. This action therefore tolerates
the non-zero exit and branches on the `mode` output:

- `mode` is set -> a real routing decision -> exposed as the `mode` output.
- `mode` is empty -> a genuine tool error -> the action fails loudly and surfaces
  the CLI stderr.

Route your downstream jobs on `needs.<gate>.outputs.mode`, never on an exit code.

<br />

## Pattern A: the two-job router (recommended)

One gate job routes to a JS-only fast job on Linux or a full native-build job.
This is the primary pattern - it keeps the common case (native unchanged) on the
fast, Linux-only lane and only pays for a native build when native inputs move.

```yaml
name: Sherlo Test - Staged

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  gate:
    name: Staged Gate
    runs-on: ubuntu-latest
    outputs:
      mode: ${{ steps.gate.outputs.mode }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
          cache: 'yarn'
      - run: yarn install
      - id: gate
        uses: sherlo-io/sherlo/actions/staged-gate@v1
        with:
          sherlo-token: ${{ secrets.SHERLO_TOKEN }}

  fast-test:
    name: Fast Test
    runs-on: ubuntu-latest
    needs: gate
    if: needs.gate.outputs.mode == 'fast'
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
          cache: 'yarn'
      - run: yarn install
      # JS-only fast path, no native build.
      - run: npx sherlo test:bundled --token ${{ secrets.SHERLO_TOKEN }}

  full-test:
    name: Full Test
    runs-on: macos-latest
    needs: gate
    if: needs.gate.outputs.mode == 'full' || needs.gate.outputs.mode == 'not-stageable'
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
          cache: 'yarn'
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: yarn install
      # Your native build steps (this example uses eas build --local).
      - run: eas build --non-interactive --local --platform android --profile preview-simulator --output android.apk
      - run: eas build --non-interactive --local --platform ios --profile preview-simulator --output ios.tar.gz
      # test:standard registers a fresh base -> the next push routes 'fast'.
      - run: npx sherlo test:standard --android android.apk --ios ios.tar.gz --token ${{ secrets.SHERLO_TOKEN }}
```

A full runnable example lives in
[`examples/staged`](../../examples/staged).

<br />

## Pattern B: the single-job `--on-stale=build` alternative

If you prefer one job over the gate-plus-two-jobs split, run `test:bundled` with
`--on-stale=build`. It takes the fast path when the base matches, and when the
base is stale it rebuilds natively via your `staged.fullBuild` config and falls
back to a full, base-registering run - all in one job.

```yaml
name: Sherlo Test - Staged (single job)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  staged-test:
    name: Staged Test
    # macOS so the fallback iOS native build can run when the base is stale.
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
          cache: 'yarn'
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: yarn install
      # Fast path when the base matches; on a stale base it runs the
      # `staged.fullBuild` commands from sherlo.config.json, then a full
      # test:standard run that registers a fresh base.
      - run: npx sherlo test:bundled --on-stale=build --token ${{ secrets.SHERLO_TOKEN }}
```

This needs a `staged.fullBuild` block in `sherlo.config.json`:

```json
{
  "devices": [{ "id": "iphone.15.pro", "osVersion": "17" }],
  "staged": {
    "fullBuild": {
      "android": ["eas build --non-interactive --local --platform android --profile preview-simulator --output android.apk"],
      "ios": ["eas build --non-interactive --local --platform ios --profile preview-simulator --output ios.tar.gz"]
    }
  }
}
```

**Trade-off.** Pattern B is simpler (one job, one config-driven fallback), but it
has no Linux-only fast lane: because the job must be able to run the native
fallback build, it runs on macOS even when the base matches and the run stays
JS-only. Pattern A keeps the fast case on cheaper Linux runners and only spends a
macOS runner when a native build is actually required. `--on-stale` defaults to
`fail`, which refuses with a diff naming the changed sources instead of
rebuilding; tests are never silently skipped.

<br />

## Learn more

To learn more about the staged testing method, visit our
[documentation](https://sherlo.io/docs).
