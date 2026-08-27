# Sherlo CLI: Visual testing for React Native

Sherlo is a [visual regression testing tool for React Native](https://sherlo.io). The `sherlo` CLI orchestrates it - capture screenshots on iOS and Android simulators in the cloud, detect visual regressions, and ship UI updates with confidence.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## Commands

### `init`

Initialize Sherlo in your project.

```bash
npx sherlo init [--token <token>]
```

**Options:**

- `--token <token>` - Authentication token for the project

---

### `test`

Run visual tests. This is the one testing command; the flags you pass pick which
of its two roads runs.

```bash
# Staged road: test this commit against the already-registered native base.
npx sherlo test [options]

# Standard road: full test on the given builds, and register them as the new base.
npx sherlo test --android <path> [--ios <path>] [options]
```

**Without `--android`/`--ios` (the staged road)** it asks whether this commit can
be tested without a native rebuild, and publishes the answer as `native-needed`:

- `native-needed=false` - the JS bundle was built and the test **already ran**.
  No native build was needed. Exit code `0`.
- `native-needed=true` - native inputs moved (or no base is registered yet).
  **Nothing** was built and no test ran; build natively and re-run with
  `--android`/`--ios`. Exit code `4`.

The answers are plain `key=value` lines on stdout, so any CI can read them:

```
native-needed=false
reason=the registered base still matches this commit - running JS-only
base-fingerprint=<hash>
url=<review url>            # printed by a run that reached a build
```

A genuine tool error (bad token, network failure) throws and publishes **no**
`native-needed` key at all - that, not the exit code, is how a CI job tells an
answer from a crash. Route on the output.

On GitHub Actions the
[`sherlo-io/sherlo`](https://github.com/sherlo-io/sherlo/blob/main/action.yml)
action runs this command and republishes those lines as step outputs.

**Options:**

- `--android <path>` - Path to Android build (.apk); switches to the standard road
- `--ios <path>` - Path to iOS build (.app, .tar.gz, .tar); switches to the standard road
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)
- `--wait` - Wait for test results and exit with a code encoding the outcome
- `--wait-timeout <minutes>` - Max minutes to wait for results (default: 45)
- `--dry-run` - Staged road only: preview which stories a real run would capture, then exit. Creates no build and uploads nothing.
- `--emit-bundle-dir <path>` - Bundle, write the result to `<path>`, and exit without testing
- `--bundle-dir <path>` - Test a bundle written by `--emit-bundle-dir` instead of running the bundler

#### Supplying the bundle instead of building it

By default `test` bundles your JavaScript itself, on both roads. `--emit-bundle-dir`
and `--bundle-dir` split that into two steps, so the bundle can be built once and
reused:

```bash
# Step one: bundle, and write it out. Uploads nothing, creates no build.
npx sherlo test --emit-bundle-dir sherlo-bundle

# Step two, anywhere else: test that bundle. No bundler runs here.
npx sherlo test --bundle-dir sherlo-bundle --token <token>
```

Reach for it when something in your pipeline already builds the bundle:

- **A monorepo**, where the bundle is produced by the app package's own build and
  the Sherlo run lives elsewhere.
- **A CI pipeline with an earlier build job**, so the Sherlo job reuses that
  artifact rather than paying for a second bundle.

The directory carries a sidecar recording what the bundle was built from. Every
field of it is checked against your project before the bundle is accepted, and a
mismatch is refused rather than silently tested. Those checks read the checkout
and the lockfile only, so **the job that passes `--bundle-dir` needs no
`node_modules` of its own** - it needs neither an install nor a bundler.

On GitHub Actions the same pair are the `emit-bundle-dir` and `bundle-dir`
action inputs.

---

### `test:eas-cloud-build`

Test cloud builds created on Expo servers.

```bash
npx sherlo test:eas-cloud-build [options]
```

**Options:**

- `--easBuildScriptName <name>` - Name of the package.json script that triggers EAS Build
- `--waitForEasBuild` - Start waiting for EAS Build to be triggered manually
- `--token <token>` - Authentication token for the project
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)

---

### `eas-build-on-complete`

Process EAS Build (required for `test:eas-cloud-build`).

```bash
npx sherlo eas-build-on-complete [--profile <profile>]
```

**Options:**

- `--profile <profile>` - EAS Build profile (must match profile used in `test:eas-cloud-build`)

<br />

## Configuration file

Test settings live in `sherlo.config.json` (or the file passed to `--config`). Supported properties:

- `token` - Authentication token for the project
- `android` - Path to the Android build (.apk)
- `ios` - Path to the iOS build (.app, .tar.gz, .tar)
- `devices` - Devices to test on, each with its OS version, theme, locale, and font scale
- `include` - Story names to test; every other story is skipped
- `exclude` - Story names to skip; every other story is tested
