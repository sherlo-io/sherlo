# Build Artifacts

Build artifacts are stored as GitHub Artifacts by branch.

## Scripts

### Download Builds

```bash
# Download builds for the current branch
./scripts/downloadBuilds.sh --project expo-storybook-8 --profile development-new

# Download builds for a specific branch
./scripts/downloadBuilds.sh --project expo-storybook-8 --profile preview-new --branch feature/my-feature
```

### Upload Builds

```bash
# Upload Android build only
./scripts/uploadBuilds.sh --project expo-storybook-8 --profile development-new --platforms android

# Upload iOS build only
./scripts/uploadBuilds.sh --project expo-storybook-8 --profile preview-new --platforms ios

# Upload both platforms
./scripts/uploadBuilds.sh --project rn-storybook-7 --profile preview-new --platforms android,ios
```

## Directory Structure

```
testing/
  ├── expo-storybook-8/builds/
  │   ├── development/
  │   └── preview/
  └── rn-storybook-7/builds/
      └── preview/
```

Build files are gitignored and only stored in GitHub Artifacts. 