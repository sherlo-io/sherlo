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

if [[ "$EAS_BUILD_PROFILE" == "preview" ]]; then

    # Install jq to parse JSON
    sudo apt-get install jq -y

    if [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then

        # Details on Android build paths: https://docs.expo.dev/build-reference/android-builds/
        android_path=$(jq -r '.builds.android."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$android_path" || "$android_path" == "null" ]]; then
            android_path="android/app/build/outputs/apk/release/app-release.apk"
        fi

        yarn sherlo --token=$SHERLO_TOKEN --android=$android_path 
    fi

    if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then

        # Details on iOS build paths: https://docs.expo.dev/build-reference/ios-builds/
        ios_path=$(jq -r '.builds.ios."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
        if [[ -z "$ios_path" || "$ios_path" == "null" ]]; then
            ios_path="ios/build/App.ipa"
        fi

        yarn sherlo --token=$SHERLO_TOKEN --ios=$ios_path 
    fi
fi


