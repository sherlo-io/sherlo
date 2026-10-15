# Sherlo CLI: Visual testing for React Native

Sherlo is a [visual regression testing tool for React Native](https://sherlo.io). The `sherlo` CLI orchestrates it - capture screenshots on iOS and Android simulators in the cloud, detect visual regressions, and ship UI updates with confidence.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## Commands

### `init`

Initialize Sherlo in your project.

```bash
npx sherlo init
```

---

### `test`

Run visual tests. The command builds the iOS and Android apps itself, uploads them and tests every story.

```bash
npx sherlo test [options]
```

On your own computer, log in once with `npx sherlo login`. In CI, the project token is passed as SHERLO_TOKEN.

In CI, run one job per platform with the Sherlo GitHub Action. The jobs share one test.

On GitHub Actions the
[`sherlo-io/sherlo`](https://github.com/sherlo-io/sherlo/blob/main/action.yml)
action runs this command, one platform per job.

**Options:**

- `--platform <platform>` - Build and test one platform only (android or ios)
- `--message <message>` - Custom message to label the test
- `--include <stories>` - List of story names to include (e.g. "My Story","Another Story")
- `--config <path>` - Path to the config file (default: sherlo.config.json)
- `--project-root <path>` - Path to the root directory of your project (default: .)
- `--wait` - Wait for test results and exit with a code encoding the outcome
- `--wait-timeout <minutes>` - Max minutes to wait for results (default: 45)
- `--emit-bundle-dir <path>` - Bundle, write the result to `<path>`, and exit without testing
- `--bundle-dir <path>` - Test a bundle written by `--emit-bundle-dir` instead of running the bundler

#### Supplying the bundle instead of building it

By default `test` bundles your JavaScript itself. `--emit-bundle-dir`
and `--bundle-dir` split that into two steps, so the bundle can be built once and
reused:

```bash
# Step one: bundle, and write it out. Uploads nothing, creates no build.
npx sherlo test --emit-bundle-dir sherlo-bundle

# Step two, anywhere else: test that bundle. No bundler runs here.
npx sherlo test --bundle-dir sherlo-bundle
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

### `eas-build-on-complete`

Hand a finished EAS build to its Sherlo test. Expo runs it from your package.json scripts, when your project turns EAS on (`"build": { "tool": "eas" }` in `sherlo.config.json`).

```bash
npx sherlo eas-build-on-complete
```

<br />

## Configuration file

Test settings live in `sherlo.config.json` (or the file passed to `--config`). Supported properties:

- `build` - How the apps are built: `tool` set to `"eas"` builds them on Expo's servers, and `easProfile` names the eas.json profile to build
- `devices` - Devices to test on, each with its OS version, theme, locale, and font scale
- `include` - Story names to test; every other story is skipped
- `exclude` - Story names to skip; every other story is tested
