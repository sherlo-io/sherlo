#!/bin/bash
# Download @sherlo packages from S3, extract for portal links, install + build.
# Used by CI and local development. Self-contained (no switch-env.sh dependency).
set -euo pipefail
STAGE="${CLIENT_STAGE:-dev}"
API="https://8gbu9wv7jd.execute-api.eu-central-1.amazonaws.com/dev/get-package-endpoint"
if [ -z "${PACKAGE_TOKEN:-}" ] && [ -f .env ]; then source .env; fi
if [ -z "${PACKAGE_TOKEN:-}" ]; then echo "Error: PACKAGE_TOKEN not set" >&2; exit 1; fi
PKGS=("sherlo-sdk-client" "sherlo-api-types" "sherlo-common-client" "sherlo-shared")
NAMES=("@sherlo/sdk-client" "@sherlo/api-types" "@sherlo/common-client" "@sherlo/shared")
mkdir -p sherlo-lib; rm -rf sherlo-lib/extracted
for i in "${!PKGS[@]}"; do
  url=$(curl -sf "$API?token=$PACKAGE_TOKEN&objectKey=$STAGE/${PKGS[$i]}.tgz")
  curl -sfL -o "sherlo-lib/${PKGS[$i]}.tgz" "$url"
  dir="sherlo-lib/extracted/${NAMES[$i]}"; mkdir -p "$dir"
  tar -xzf "sherlo-lib/${PKGS[$i]}.tgz" -C "$dir" --strip-components=1
  touch "$dir/yarn.lock"
done
yarn install
