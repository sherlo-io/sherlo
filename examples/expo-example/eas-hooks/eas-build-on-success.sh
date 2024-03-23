#!/usr/bin/env bash

# Fail if anything errors
set -eox pipefail

# List of available environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
# How to add secrets to environment variables: https://docs.expo.dev/build-reference/variables/#using-secrets-in-environment-variables

## TEMP
    echo "EAS_BUILD_PROFILE: $EAS_BUILD_PROFILE"
## TEMP

if [[ "$EAS_BUILD_PROFILE" == "preview" ]]; then

    ## TEMP
        echo "List of files in android/app/build/outputs/$EAS_BUILD_PROFILE:"
        ls android/app/build/outputs/$EAS_BUILD_PROFILE
    ## TEMP

    # Details on Android build paths: https://docs.expo.dev/build-reference/android-builds/
    android_path=$(jq -r '.builds.android."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
    if [[ -z "$android_path" ]]; then
        android_path="android/app/build/outputs/$EAS_BUILD_PROFILE/android.apk"
    fi

    # Details on iOS build paths: https://docs.expo.dev/build-reference/ios-builds/
    ios_path=$(jq -r '.builds.ios."'"$EAS_BUILD_PROFILE"'"."applicationArchivePath"' eas.json)
    if [[ -z "$ios_path" ]]; then
        ios_path="ios/build/App.ipa"
    fi

    ## TEMP
        echo "SHERLO_TOKEN: $SHERLO_TOKEN"
        echo "android_path: $android_path"
        echo "ios_path: $ios_path"
    ## TEMP

    yarn sherlo --token=$SHERLO_TOKEN --android=$android_path --ios=$ios_path 
fi


