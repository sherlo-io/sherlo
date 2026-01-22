# EAS Cloud Build Testing Example

Fully automated: builds in cloud, then tests.

## Setup

1. Add scripts to `package.json`:

```json
{
  "scripts": {
    "eas:build:preview": "eas-cli build --profile preview --platform all --non-interactive",
    "eas-build-on-complete": "sherlo eas-build-on-complete --profile preview"
  }
}
```

2. Add GitHub secrets:

   - `SHERLO_TOKEN`
   - `EXPO_TOKEN`

3. Copy workflow to `.github/workflows/sherlo.yml`

## How it works

On every merge to main:

1. Triggers EAS Build in cloud
2. Waits for build completion
3. Runs Sherlo tests automatically

No local builds needed.
