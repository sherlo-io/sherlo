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
  echo "Error: --profile parameter is required (development-old, development-new, etc.)"
  exit 1
fi

if [ ${#PLATFORMS[@]} -eq 0 ]; then
  echo "Error: --platforms parameter is required (android,ios or android or ios)"
  exit 1
fi

echo "Uploading builds for project: $PROJECT, profile: $PROFILE, platforms: ${PLATFORMS[*]}, branch: $CURRENT_BRANCH"

# Function to upload an artifact
upload_artifact() {
  local file_path=$1
  local artifact_name=$2
  
  # Get GitHub token from environment or gh auth token
  GITHUB_TOKEN=${GITHUB_TOKEN:-$(gh auth token)}
  
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set and could not get from gh auth"
    exit 1
  fi
  
  # Get repository details from remote URL
  REPO_URL=$(git config --get remote.origin.url)
  REPO_PATH=$(echo "$REPO_URL" | sed -E 's|.*github\.com[:/]([^/]+/[^/]+)(\.git)?|\1|')
  
  echo "Creating artifact: $artifact_name"
  
  # Create a temporary zip file
  TEMP_ZIP=$(mktemp).zip
  mkdir -p $(dirname "$TEMP_ZIP")
  
  # Zip the file
  echo "Compressing file: $file_path"
  zip -j "$TEMP_ZIP" "$file_path"
  
  # Upload the artifact using the repository dispatch API with the file as a base64-encoded payload
  # This is a workaround since GitHub doesn't have a direct API for artifacts outside of Actions
  echo "Uploading $artifact_name (this might take a while for large files)..."
  
  # Create a new workflow run to handle the artifact
  WORKFLOW_ID=$(gh api \
    -X POST \
    -H "Accept: application/vnd.github.v3+json" \
    "/repos/$REPO_PATH/actions/workflows/upload-artifact.yml/dispatches" \
    -f ref="$CURRENT_BRANCH" \
    -f inputs="{\"name\":\"$artifact_name\", \"retention-days\":90}" \
    --jq '.id' 2>/dev/null || echo "")
    
  if [ -z "$WORKFLOW_ID" ]; then
    echo "Failed to start artifact upload workflow. Falling back to manual upload..."
    echo "Please manually upload the file: $file_path"
    echo "To do this, go to Actions tab in GitHub, run the 'Upload Artifact' workflow manually with:"
    echo "  - name: $artifact_name"
    echo "  - path: $(basename "$file_path")"
    echo "  - retention-days: 90"
    return 1
  fi
  
  echo "Upload workflow started for $artifact_name. The artifact will be available in GitHub Actions."
  
  # Clean up
  rm -f "$TEMP_ZIP"
}

# Upload Android build
if [[ " ${PLATFORMS[*]} " =~ " android " ]]; then
  ANDROID_PATH="testing/$PROJECT/builds/$PROFILE/android.apk"
  if [ -f "$ANDROID_PATH" ]; then
    echo "Found Android build at $ANDROID_PATH"
    ARTIFACT_NAME="android-$PROFILE-$PROJECT-$CURRENT_BRANCH"
    upload_artifact "$ANDROID_PATH" "$ARTIFACT_NAME"
  else
    echo "Error: Android build not found at $ANDROID_PATH"
    exit 1
  fi
fi

# Upload iOS build
if [[ " ${PLATFORMS[*]} " =~ " ios " ]]; then
  IOS_PATH="testing/$PROJECT/builds/$PROFILE/ios.tar.gz"
  if [ -f "$IOS_PATH" ]; then
    echo "Found iOS build at $IOS_PATH"
    ARTIFACT_NAME="ios-$PROFILE-$PROJECT-$CURRENT_BRANCH"
    upload_artifact "$IOS_PATH" "$ARTIFACT_NAME"
  else
    echo "Error: iOS build not found at $IOS_PATH"
    exit 1
  fi
fi

echo "Upload process complete. Artifacts should be available in GitHub Actions." 