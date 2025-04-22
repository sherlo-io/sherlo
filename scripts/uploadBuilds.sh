#!/bin/bash
set -e

# Default values
PROJECT=""
PROFILE=""
PLATFORMS=()
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

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
    --platforms)
      IFS=',' read -ra PLATFORMS <<< "$2"
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
  echo "Error: --profile parameter is required (development, preview, production)"
  exit 1
fi

if [ ${#PLATFORMS[@]} -eq 0 ]; then
  echo "Error: --platforms parameter is required (android,ios or android or ios)"
  exit 1
fi

echo "Uploading builds for project: $PROJECT, profile: $PROFILE, platforms: ${PLATFORMS[*]}, branch: $CURRENT_BRANCH"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Upload Android build
if [[ " ${PLATFORMS[*]} " =~ " android " ]]; then
  ANDROID_PATH="testing/$PROJECT/builds/$PROFILE/android.apk"
  if [ -f "$ANDROID_PATH" ]; then
    echo "Uploading Android build from $ANDROID_PATH"
    
    # Create a temporary directory for the Android build
    mkdir -p "$TEMP_DIR/android"
    cp "$ANDROID_PATH" "$TEMP_DIR/android/"
    
    # Create a zip file with the Android build
    (cd "$TEMP_DIR/android" && zip -r "$TEMP_DIR/android.zip" .)
    
    # Upload the Android build
    gh api \
      --method POST \
      -H "Accept: application/vnd.github.v3+json" \
      -F "name=android-$PROFILE-$PROJECT-$CURRENT_BRANCH" \
      -F "retention_days=90" \
      -F "archive=@$TEMP_DIR/android.zip" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts"
    
    echo "Android build uploaded as artifact: android-$PROFILE-$PROJECT-$CURRENT_BRANCH"
  else
    echo "Error: Android build not found at $ANDROID_PATH"
    exit 1
  fi
fi

# Upload iOS build
if [[ " ${PLATFORMS[*]} " =~ " ios " ]]; then
  IOS_PATH="testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  if [ -f "$IOS_PATH" ]; then
    echo "Uploading iOS build from $IOS_PATH"
    
    # Create a temporary directory for the iOS build
    mkdir -p "$TEMP_DIR/ios"
    cp "$IOS_PATH" "$TEMP_DIR/ios/"
    
    # Create a zip file with the iOS build
    (cd "$TEMP_DIR/ios" && zip -r "$TEMP_DIR/ios.zip" .)
    
    # Upload the iOS build
    gh api \
      --method POST \
      -H "Accept: application/vnd.github.v3+json" \
      -F "name=ios-$PROFILE-$PROJECT-$CURRENT_BRANCH" \
      -F "retention_days=90" \
      -F "archive=@$TEMP_DIR/ios.zip" \
      "/repos/$GITHUB_REPOSITORY/actions/artifacts"
    
    echo "iOS build uploaded as artifact: ios-$PROFILE-$PROJECT-$CURRENT_BRANCH"
  else
    echo "Error: iOS build not found at $IOS_PATH"
    exit 1
  fi
fi

echo "Upload complete!" 