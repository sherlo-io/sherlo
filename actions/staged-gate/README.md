# Sherlo Staged Gate action

A composite GitHub Action that runs `sherlo test` on its JS-only staged road and
exposes whether this commit needs a native build first - so a caller workflow
spends a native build only when native inputs actually moved.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## What it does

`sherlo test` with no build paths asks one question: can this commit be tested
against the already-registered native base?

| `native-needed` | Meaning                                                        | What already happened                                     |
| --------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `false`         | Native inputs unchanged; a registered base matches source        | The test **already ran**, JS-only, on this Linux runner    |
| `true`          | Native inputs moved, or no base is registered for this source    | **Nothing** was built, nothing uploaded, no test ran       |

Note the shape: the fast case is not routed to a second job, it is **already
done** when this action finishes. Only `native-needed=true` needs a follow-up
job that builds natively and runs
`sherlo test --android <path> [--ios <path>]` - which also registers the fresh
base, so the next commit with native unchanged answers `false` again.

<br />

## Usage

```yaml
uses: sherlo-io/sherlo/actions/staged-gate@v1
```

Pin to a released tag (as above) or a commit SHA in your own repository.

### Inputs

| Input               | Required | Default              | Description                                       |
| ------------------- | -------- | -------------------- | ------------------------------------------------- |
| `sherlo-token`      | yes      | -                    | Sherlo project token (`SHERLO_TOKEN`)             |
| `working-directory` | no       | `.`                  | Directory to run `sherlo test` in (project root)  |
| `config`            | no       | `sherlo.config.json` | Path to the Sherlo config file                    |

### Outputs

| Output             | Description                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `native-needed`    | `true` if a native build is required first, `false` if the run completed |
| `reason`           | Single-line human explanation of the answer                          |
| `base-fingerprint` | Source base fingerprint (may be empty)                               |

<br />

## Route on the output, not the exit code (handled for you)

`sherlo test` exits `0` when the run completed and `4` when a native build is
needed. The `4` is an expected answer, not a failure - a naive step would fail
the whole workflow on any native change. This action therefore tolerates the
non-zero exit and branches on the `native-needed` output.

The discriminator between an answer and a crash is the output itself: on a real
decision the CLI writes `native-needed=...` to `$GITHUB_OUTPUT` before exiting;
a genuine tool error (bad token, network failure) throws and writes nothing.

- `native-needed` is set -> a real answer -> exposed as the action's output.
- `native-needed` is empty -> a genuine tool error -> the action fails loudly and
  surfaces the CLI stderr.

Route your follow-up job on `needs.<gate>.outputs.native-needed`, never on an
exit code.

<br />

## The pattern: run first, build natively only if asked

```yaml
name: Sherlo Test

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    name: Sherlo Test
    runs-on: ubuntu-latest
    outputs:
      native-needed: ${{ steps.sherlo.outputs.native-needed }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
          cache: 'yarn'
      - run: yarn install
      # Runs the test JS-only when the base still matches. Builds nothing when
      # it doesn't - it just says so.
      - id: sherlo
        uses: sherlo-io/sherlo/actions/staged-gate@v1
        with:
          sherlo-token: ${{ secrets.SHERLO_TOKEN }}

  native-test:
    name: Native Test
    runs-on: macos-latest
    needs: test
    if: needs.test.outputs.native-needed == 'true'
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
      # The same verb, given build paths: a full run that REGISTERS the fresh
      # base -> the next push with native unchanged tests JS-only again.
      - run: npx sherlo test --android android.apk --ios ios.tar.gz --token ${{ secrets.SHERLO_TOKEN }}
```

A full runnable example lives in
[`examples/staged`](../../examples/staged).

<br />

## Single-job variant

If you would rather not split jobs, run both steps in one macOS job: `sherlo
test` first, then build natively and re-run with build paths only when the first
step asked for it.

```yaml
jobs:
  test:
    # macOS so the native build can run when it is needed.
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

      - id: sherlo
        uses: sherlo-io/sherlo/actions/staged-gate@v1
        with:
          sherlo-token: ${{ secrets.SHERLO_TOKEN }}

      - if: steps.sherlo.outputs.native-needed == 'true'
        run: |
          eas build --non-interactive --local --platform android --profile preview-simulator --output android.apk
          eas build --non-interactive --local --platform ios --profile preview-simulator --output ios.tar.gz
          npx sherlo test --android android.apk --ios ios.tar.gz --token ${{ secrets.SHERLO_TOKEN }}
```

**Trade-off.** The single job is simpler, but it has no Linux-only lane: because
it must be able to run the native build, it runs on macOS even when the base
matches and the run stays JS-only. The two-job pattern keeps the common case on
cheaper Linux runners and only spends a macOS runner when a native build is
actually required.

<br />

## Learn more

To learn more about the staged testing method, visit our
[documentation](https://sherlo.io/docs).
