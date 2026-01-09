#!/bin/bash
#
# Download Testing Builds Script
# 
# Downloads testing build (Android APK and iOS tar.gz) from GitHub Artifacts.
# These builds are used for testing.
#
# Flags:
#   --project   (required) Project to download builds for: expo | react-native
#   --profile   (required) Build profile: development | preview
#   --branch    (optional) Branch name, defaults to current branch
#
# Usage:
#   # Download testing builds for the current branch
#   ./scripts/download-testing-builds.sh --project expo --profile development
#
#   # Download testing builds for a specific branch
#   ./scripts/download-testing-builds.sh --project expo --profile preview --branch feature/my-feature
#

set -e

# Default values
PROJECT=""
PROFILE=""
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GITHUB_REPOSITORY="sherlo-io/sherlo"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT="$2"
      shift 2
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --branch)
      CURRENT_BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$PROJECT" ]; then
  echo "Error: --project parameter is required (expo or react-native)"
  exit 1
fi

if [ -z "$PROFILE" ]; then
  echo "Error: --profile parameter is required (development, preview)"
  exit 1
fi

echo "📱 Downloading testing builds"
echo "   Project: $PROJECT"
echo "   Profile: $PROFILE"
echo "   Branch: $CURRENT_BRANCH"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create directories if they don't exist
mkdir -p "testing/$PROJECT/builds/$PROFILE"

# Download Android build
echo "🤖 Downloading Android build..."
gh api \
  -H "Accept: application/vnd.github.v3+json" \
  "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=android-$PROFILE-$PROJECT-$CURRENT_BRANCH" > "$TEMP_DIR/android_artifacts.json"

ANDROID_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/android_artifacts.json")
if [ "$ANDROID_ARTIFACT_ID" != "null" ]; then
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts/$ANDROID_ARTIFACT_ID/zip" > "$TEMP_DIR/android.zip"
  unzip -q "$TEMP_DIR/android.zip" -d "$TEMP_DIR/android"
  cp "$TEMP_DIR/android/android.apk" "testing/$PROJECT/builds/$PROFILE/android.apk"
  echo " ✓ Android build downloaded: testing/$PROJECT/builds/$PROFILE/android.apk"
else
  echo " ⚠ No Android build found for branch $CURRENT_BRANCH, trying dev branch..."
  # Try with dev branch
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=android-$PROFILE-$PROJECT-dev" > "$TEMP_DIR/android_artifacts_dev.json"
  
  ANDROID_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/android_artifacts_dev.json")
  if [ "$ANDROID_ARTIFACT_ID" != "null" ]; then
    gh api \
      -H "Accept: application/vnd.github.v3+json" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts/$ANDROID_ARTIFACT_ID/zip" > "$TEMP_DIR/android.zip"
    unzip -q "$TEMP_DIR/android.zip" -d "$TEMP_DIR/android"
    cp "$TEMP_DIR/android/android.apk" "testing/$PROJECT/builds/$PROFILE/android.apk"
    echo " ✓ Android build (dev branch) downloaded: testing/$PROJECT/builds/$PROFILE/android.apk"
  else
    echo " ✗ No Android build found"
  fi
fi

# Download iOS build
echo ""
echo "🍎 Downloading iOS build..."
gh api \
  -H "Accept: application/vnd.github.v3+json" \
  "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=ios-$PROFILE-$PROJECT-$CURRENT_BRANCH" > "$TEMP_DIR/ios_artifacts.json"

IOS_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/ios_artifacts.json")
if [ "$IOS_ARTIFACT_ID" != "null" ]; then
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts/$IOS_ARTIFACT_ID/zip" > "$TEMP_DIR/ios.zip"
  unzip -q "$TEMP_DIR/ios.zip" -d "$TEMP_DIR/ios"
  cp "$TEMP_DIR/ios/ios.tar.gz" "testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  echo " ✓ iOS build downloaded: testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
else
  echo " ⚠ No iOS build found for branch $CURRENT_BRANCH, trying dev branch..."
  # Try with dev branch
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=ios-$PROFILE-$PROJECT-dev" > "$TEMP_DIR/ios_artifacts_dev.json"
  
  IOS_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/ios_artifacts_dev.json")
  if [ "$IOS_ARTIFACT_ID" != "null" ]; then
    gh api \
      -H "Accept: application/vnd.github.v3+json" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts/$IOS_ARTIFACT_ID/zip" > "$TEMP_DIR/ios.zip"
    unzip -q "$TEMP_DIR/ios.zip" -d "$TEMP_DIR/ios"
    cp "$TEMP_DIR/ios/ios.tar.gz" "testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
    echo " ✓ iOS build (dev branch) downloaded: testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  else
    echo " ✗ No iOS build found"
  fi
fi

echo ""
echo "🎉 Testing builds downloaded successfully!" 