# Standard Testing Example

Tests pre-built app binaries on merge to main.

## Setup

1. Build your app locally:

```bash
   npx eas-cli build --local --profile preview --platform all
```

2. Commit builds to repo:

```
   builds/
     preview/
       android.apk
       ios.tar.gz
```

3. Add GitHub secret: `SHERLO_TOKEN`

4. Copy workflow to `.github/workflows/sherlo.yml`

## Notes

- Builds must be updated manually when code changes
- Consider using Git LFS for binary files
