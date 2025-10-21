# Build Artifacts

Build artifacts are stored as GitHub Artifacts by branch.

## Scripts

### Download Builds

```bash
# Download builds for the current branch
./scripts/downloadBuilds.sh --project expo --profile development

# Download builds for a specific branch
./scripts/downloadBuilds.sh --project expo --profile preview --branch feature/my-feature
```
