# Device tests

Tests that need a real Android device (an emulator is fine) and an installable
build of `testing/expo`.

They are not part of `pr_checks` - they need a built APK and a running
emulator, neither of which a PR check has. CI runs them through the
`test:device-sanity` workflow (`workflow_dispatch`), which builds the app with
`build:android.yml` and then runs this suite on
[`reactivecircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner).

## Running locally

Boot an emulator (or plug in a device) so that `adb devices` lists exactly one
ready device, build `testing/expo` for the `preview` profile, then:

```bash
SHERLO_APK_PATH=/absolute/path/to/android.apk \
ALLOW_LOCAL_TEST_EXEC=1 yarn test
```

`ALLOW_LOCAL_TEST_EXEC=1` is the repo-wide opt-in for running a suite on your
own machine (see `scripts/require-test-exec-optin.sh`).

## Android only

The suite drives Android, because `adb` ships with the Android SDK every
contributor and CI runner already has. The equivalent iOS run needs a UI driver
(`idb` or similar) that is not part of this repo's tooling, so it is not
included rather than included and never run. The iOS shim is covered on the
artifact instead, by `build:ios.yml`'s
`scripts/assert-artifact-contains-shim.mjs` step.
