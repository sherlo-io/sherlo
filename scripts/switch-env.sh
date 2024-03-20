#!/bin/bash

# Adjust path to monorepo root and sherlo-lib directory
SHERLO_LIB_DIR="sherlo-lib"
NODE_MODULES="node_modules"

# S3 base URL for downloading packages
GET_PACKAGE_URL="https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package"

# Read GET_PACKAGE_TOKEN from .env file
ENV_PATH=./.env
if test -f "$ENV_PATH"; then
  source $ENV_PATH
fi

if [[ -z "$PACKAGE_TOKEN" ]]; then
    echo "Error: PACKAGE_TOKEN is not set or empty. Please set it in the .env file."
    exit 1
fi

env=$1

FILENAMES=("sherlo-sdk-client" "sherlo-api-types" "sherlo-common-client" "sherlo-shared")
PACKAGE_NAMES=("@sherlo/sdk-client" "@sherlo/api-types" "@sherlo/common-client" "@sherlo/shared")

# Ensure the sherlo-lib directory exists
mkdir -p $SHERLO_LIB_DIR

download_extract_link() {
    local ref=$1
    echo "Handling packages for environment: $ref"

    for i in "${!FILENAMES[@]}"; do
        filename=${FILENAMES[$i]}
        packagename=${PACKAGE_NAMES[$i]}

        # Get url to the .tgz file
        url=$(curl -X GET "$GET_PACKAGE_URL?token=$PACKAGE_TOKEN&objectKey=$ref/$filename.tgz")

        # Download the .tgz file
        curl -o "$SHERLO_LIB_DIR/$filename.tgz" -L "$url" --silent
        echo "Downloaded $filename for $ref"

        # Extract to a dedicated directory within sherlo-lib
        extract_dir="$SHERLO_LIB_DIR/extracted/$packagename"
        mkdir -p "$extract_dir"
        tar -xzf "$SHERLO_LIB_DIR/$filename.tgz" -C "$extract_dir" --strip-components=1
        echo "Extracted $filename"

        # Link the package globally using yarn
        (cd "$extract_dir" && yarn link)
        echo "Registered $packagename for linking"

        # Link the package in the project where it's used
        (cd "$NODE_MODULES/@sherlo" && yarn link "$packagename")
        echo "Linked $packagename to $NODE_MODULES/@sherlo/$packagename"
    done

    echo "All packages handled for environment: $ref"
}

cleanup() {
    echo "Cleaning up..."

    for packagename in "${PACKAGE_NAMES[@]}"; do
        # Unlink the package from the project
        (cd "$NODE_MODULES" && yarn unlink "$packagename")
        echo "Unlinked $packagename from $NODE_MODULES/$packagename"
    done

    # Optionally, remove the extracted directories
    rm -rf "$SHERLO_LIB_DIR/extracted"
    echo "Cleaned up extracted directories."

    echo "Cleanup complete."

    yarn install --force
}

# Check environment and execute the appropriate action
if [[ "$env" == "prod" ]]; then
    cleanup
else
    download_extract_link $env
fi
