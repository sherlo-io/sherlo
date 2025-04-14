#!/bin/bash

SHERLO_LIB_DIR="$(pwd)/sherlo-lib"

# S3 base URL for downloading packages
GET_PACKAGE_URL="https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package-endpoint"

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

    rm -rf $SHERLO_LIB_DIR/extracted

    for i in "${!FILENAMES[@]}"; do
        filename=${FILENAMES[$i]}
        packagename=${PACKAGE_NAMES[$i]}

        # Get url to the .tgz file
        url=$(curl -X GET "$GET_PACKAGE_URL?token=$PACKAGE_TOKEN&objectKey=$ref/$filename.tgz")
        echo "url: $url"

        # Download the .tgz file
        curl -o "$SHERLO_LIB_DIR/$filename.tgz" -L "$url" --silent
        echo "Downloaded $filename for $ref"

        # Extract to a dedicated directory within sherlo-lib
        extract_dir="$SHERLO_LIB_DIR/extracted/$packagename"
        mkdir -p "$extract_dir"
        tar -xzf "$SHERLO_LIB_DIR/$filename.tgz" -C "$extract_dir" --strip-components=1
        echo "Extracted $filename"

        # Add yarn.lock to the package so it's recognized as a package
        (cd "$extract_dir" && touch yarn.lock)
    done

    echo "All packages handled for environment: $ref"
}

download_extract_link $env