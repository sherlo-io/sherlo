#!/bin/bash
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
  echo "Error: --project parameter is required (expo-storybook-8 or rn-storybook-7)"
  exit 1
fi

if [ -z "$PROFILE" ]; then
  echo "Error: --profile parameter is required (development-old, development-new, preview-old, preview-new)"
  exit 1
fi

echo "Downloading builds for project: $PROJECT, profile: $PROFILE, branch: $CURRENT_BRANCH"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create directories if they don't exist
mkdir -p "testing/$PROJECT/builds/$PROFILE"

# Download Android build
echo "Downloading Android build..."
gh api \
  -H "Accept: application/vnd.github.v3+json" \
  "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=android-$PROFILE-$PROJECT-$CURRENT_BRANCH" > "$TEMP_DIR/android_artifacts.json"

ANDROID_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/android_artifacts.json")
if [ "$ANDROID_ARTIFACT_ID" != "null" ]; then
  echo "Found Android artifact ID: $ANDROID_ARTIFACT_ID"
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts/$ANDROID_ARTIFACT_ID/zip" > "$TEMP_DIR/android.zip"
  unzip -o "$TEMP_DIR/android.zip" -d "$TEMP_DIR/android"
  cp "$TEMP_DIR/android/android.apk" "testing/$PROJECT/builds/$PROFILE/android.apk"
  echo "Android build downloaded to testing/$PROJECT/builds/$PROFILE/android.apk"
else
  echo "No Android build found for branch $CURRENT_BRANCH, trying dev branch..."
  # Try with dev branch
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=android-$PROFILE-$PROJECT-dev" > "$TEMP_DIR/android_artifacts_dev.json"
  
  ANDROID_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/android_artifacts_dev.json")
  if [ "$ANDROID_ARTIFACT_ID" != "null" ]; then
    echo "Found Android artifact ID from dev branch: $ANDROID_ARTIFACT_ID"
    gh api \
      -H "Accept: application/vnd.github.v3+json" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts/$ANDROID_ARTIFACT_ID/zip" > "$TEMP_DIR/android.zip"
    unzip -o "$TEMP_DIR/android.zip" -d "$TEMP_DIR/android"
    cp "$TEMP_DIR/android/android.apk" "testing/$PROJECT/builds/$PROFILE/android.apk"
    echo "Android build from dev branch downloaded to testing/$PROJECT/builds/$PROFILE/android.apk"
  else
    echo "No Android build found for branch $CURRENT_BRANCH or dev branch"
  fi
fi

# Download iOS build
echo "Downloading iOS build..."
gh api \
  -H "Accept: application/vnd.github.v3+json" \
  "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=ios-$PROFILE-$PROJECT-$CURRENT_BRANCH" > "$TEMP_DIR/ios_artifacts.json"

IOS_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/ios_artifacts.json")
if [ "$IOS_ARTIFACT_ID" != "null" ]; then
  echo "Found iOS artifact ID: $IOS_ARTIFACT_ID"
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts/$IOS_ARTIFACT_ID/zip" > "$TEMP_DIR/ios.zip"
  unzip -o "$TEMP_DIR/ios.zip" -d "$TEMP_DIR/ios"
  cp "$TEMP_DIR/ios/ios.tar.gz" "testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  echo "iOS build downloaded to testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
else
  echo "No iOS build found for branch $CURRENT_BRANCH, trying dev branch..."
  # Try with dev branch
  gh api \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts?name=ios-$PROFILE-$PROJECT-dev" > "$TEMP_DIR/ios_artifacts_dev.json"
  
  IOS_ARTIFACT_ID=$(jq '.artifacts[0].id' "$TEMP_DIR/ios_artifacts_dev.json")
  if [ "$IOS_ARTIFACT_ID" != "null" ]; then
    echo "Found iOS artifact ID from dev branch: $IOS_ARTIFACT_ID"
    gh api \
      -H "Accept: application/vnd.github.v3+json" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts/$IOS_ARTIFACT_ID/zip" > "$TEMP_DIR/ios.zip"
    unzip -o "$TEMP_DIR/ios.zip" -d "$TEMP_DIR/ios"
    cp "$TEMP_DIR/ios/ios.tar.gz" "testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
    echo "iOS build from dev branch downloaded to testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  else
    echo "No iOS build found for branch $CURRENT_BRANCH or dev branch"
  fi
fi

echo "Done downloading builds!" 