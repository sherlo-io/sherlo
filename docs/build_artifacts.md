# Build Artifacts

Build artifacts are stored as GitHub Artifacts by branch.

## Scripts

### Download Builds

```bash
# Download builds for the current branch
./scripts/downloadBuilds.sh --project expo --profile development-new

# Download builds for a specific branch
./scripts/downloadBuilds.sh --project expo --profile preview-new --branch feature/my-feature
```
