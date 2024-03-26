#!/usr/bin/env bash

# Fail if anything errors
set -eox pipefail

# Build lifecycle hooks: https://docs.expo.dev/build-reference/npm-hooks/
# List of available environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
# How to add secrets to environment variables: https://docs.expo.dev/build-reference/variables/#using-secrets-in-environment-variables

# We only execute this command if the build runner is EAS Build
# If user builds the app localy they need to manually choose when to run Sherlo tests
if [[ "$EAS_BUILD_RUNNER" != "eas-build" ]]; then
    exit
fi

SHERLO_BUILD_PROFILE=$1
if [ -z "$SHERLO_BUILD_PROFILE" ]; then
    echo "Error: You must provide the EAS profile as an argument to this script."
    exit 1
fi

if [[ "$EAS_BUILD_PROFILE" == "$SHERLO_BUILD_PROFILE" ]]; then

    # Install dependencies
    if [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then
        sudo apt-get install jq -y
    elif [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
        brew update
        brew install jq
    else
        # Sherlo is not supported on this platform
        echo "The platform '$EAS_BUILD_PLATFORM' is not supported by this script."
        exit 0
    fi

    # Check for sherlo.json file
    SHERLO_BUILD_FILE="./.expo/sherlo.json"
    if [ ! -f "$SHERLO_BUILD_FILE" ]; then
        echo "Error: File $SHERLO_BUILD_FILE does not exist. If you're using monorepo make sure to provide a valid 'projectRoot' option in CLI or Github Action"
        exit 1
    fi

    # Extract buildIndex from sherlo.json
    buildIndex=$(jq '.buildIndex' "$SHERLO_BUILD_FILE")
    if [ "$buildIndex" = "null" ] || ! [[ "$buildIndex" =~ ^[0-9]+$ ]]; then
        echo "Error: 'buildIndex' is either not present or not a valid number in $SHERLO_BUILD_FILE."
        exit 1
    fi


    if [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then
        # Details on Android build paths: https://docs.expo.dev/build-reference/android-builds/
        android_path=$(jq -r '.builds.android."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$android_path" || "$android_path" == "null" ]]; then
            android_path="android/app/build/outputs/apk/release/app-release.apk"
        fi

        yarn sherlo --asyncUploadCommitHash=$buildIndex --token=$SHERLO_TOKEN --android=$android_path 
    fi

    if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
        # Details on iOS build paths: https://docs.expo.dev/build-reference/ios-builds/
        ios_path=$(jq -r '.builds.ios."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$ios_path" || "$ios_path" == "null" ]]; then
            ios_path=$(find ios/build/Build/Products/Release-iphonesimulator -name "*.app" -print -quit)
        fi

        yarn sherlo --asyncUploadCommitHash=$EAS_BUILD_GIT_COMMIT_HASH --token=$SHERLO_TOKEN --ios=$ios_path 
    fi
fi


