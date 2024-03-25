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

BUILD_DATA_EXPO_FILE="./.expo/sherlo.json"

if [[ "$EAS_BUILD_PROFILE" == "preview" ]]; then

    # Check if the file exists
    if [ -f "$BUILD_DATA_EXPO_FILE" ]; then
        echo "Displaying contents of $BUILD_DATA_EXPO_FILE:"
        cat "$BUILD_DATA_EXPO_FILE"
    else
        echo "Error: File $BUILD_DATA_EXPO_FILE does not exist. If you're using monorepo make sure to provide valid 'projectRoot' option in CLI or Github Action"
    fi

    if [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then
        # Install jq to parse JSON
        sudo apt-get install jq -y

        # Details on Android build paths: https://docs.expo.dev/build-reference/android-builds/
        android_path=$(jq -r '.builds.android."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$android_path" || "$android_path" == "null" ]]; then
            android_path="android/app/build/outputs/apk/release/app-release.apk"
        fi

        yarn sherlo --asyncUploadCommitHash=$EAS_BUILD_GIT_COMMIT_HASH --token=$SHERLO_TOKEN --android=$android_path 
    fi

    if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
        # Install jq to parse JSON
        brew update
        brew install jq

        # Details on iOS build paths: https://docs.expo.dev/build-reference/ios-builds/
        ios_path=$(jq -r '.builds.ios."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$ios_path" || "$ios_path" == "null" ]]; then
            ios_path=$(find ios/build/Build/Products/Release-iphonesimulator -name "*.app" -print -quit)
        fi

        yarn sherlo --asyncUploadCommitHash=$EAS_BUILD_GIT_COMMIT_HASH --token=$SHERLO_TOKEN --ios=$ios_path 
    fi
fi


