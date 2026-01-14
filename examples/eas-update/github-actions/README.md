# EAS Update Testing Example

Tests JavaScript updates without rebuilding native code.

## Setup

1. One-time: Build development builds locally:

```bash
   npx eas-cli build --local --profile development --platform all
```

2. Commit builds to repo:

```
   builds/
     development/
       android.apk
       ios.tar.gz
```

3. Add GitHub secrets:

   - `SHERLO_TOKEN`
   - `EXPO_TOKEN`

4. Copy workflow to `.github/workflows/sherlo.yml`

## How it works

On every merge to main:

1. Publishes JavaScript changes to EAS Update
2. Tests the update on existing native builds

Rebuild only when native code changes.
