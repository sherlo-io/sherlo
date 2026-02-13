#!/bin/bash
#
# Switch Environment Script
#
# Downloads internal Sherlo packages from S3 for a specific environment (test/dev/prod).
# These are private packages that are not published to npm and are used during development.
#
# Requirements:
#   - PACKAGE_TOKEN must be set in .env file (authentication for S3)
#
# What it does:
#   1. Downloads 4 internal packages from S3 (@sherlo/sdk-client, @sherlo/api-types, 
#      @sherlo/common-client, @sherlo/shared)
#   2. Extracts them to sherlo-lib/extracted/@sherlo/*
#   3. Runs yarn install to link them as portal dependencies
#
# Usage:
#   ./scripts/switch-env.sh test
#   ./scripts/switch-env.sh dev
#   ./scripts/switch-env.sh prod
#

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
    echo "📦 Downloading packages for environment: $ref"
    echo ""

    rm -rf $SHERLO_LIB_DIR/extracted

    for i in "${!FILENAMES[@]}"; do
        filename=${FILENAMES[$i]}
        packagename=${PACKAGE_NAMES[$i]}

        # Get url to the .tgz file
        url=$(curl -X GET "$GET_PACKAGE_URL?token=$PACKAGE_TOKEN&objectKey=$ref/$filename.tgz")

        # Download the .tgz file
        curl -o "$SHERLO_LIB_DIR/$filename.tgz" -L "$url" --silent
        echo " ✓ Downloaded $packagename"

        # Extract to a dedicated directory within sherlo-lib
        extract_dir="$SHERLO_LIB_DIR/extracted/$packagename"
        mkdir -p "$extract_dir"
        tar -xzf "$SHERLO_LIB_DIR/$filename.tgz" -C "$extract_dir" --strip-components=1

        # Add yarn.lock to the package so it's recognized as a package
        (cd "$extract_dir" && touch yarn.lock)
    done

    echo ""
    echo "✓ All packages downloaded and extracted"
}

download_extract_link $env

echo ""
echo "Installing dependencies..."
yarn install
echo "✓ Dependencies installed"
echo ""

echo "Building packages..."
yarn build
echo "✓ Packages built"
echo ""

echo "🎉 Environment switched to: $env"