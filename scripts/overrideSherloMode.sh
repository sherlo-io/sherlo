#!/bin/bash

# Initialize variables with defaults
platform=""
buildPath=""
clear_mode=false
clear_all=false
override_mode="storybook"

# Define SDK and tool paths
ANDROID_SDK_PATH=~/Library/Android/sdk
AAPT_PATH="${ANDROID_SDK_PATH}/build-tools/34.0.0/aapt"
ADB_PATH="${ANDROID_SDK_PATH}/platform-tools/adb"

# Define sherlo config
SHERLO_CONFIG_FILE="config.sherlo"

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../testing/expo-storybook-8" && pwd )"

# Function to show usage
show_usage() {
    echo "Usage: $0 (--android | --ios) --path=<build_path> [--clear] [--clearAll] [--mode=<mode>]"
    echo "Options:"
    echo "  --android          Set platform to Android"
    echo "  --ios             Set platform to iOS"
    echo "  --path=<path>     Specify the build path"
    echo "  --clear           Remove the config file instead of creating it"
    echo "  --clearAll        Clear all development and preview builds"
    echo "  --mode=<mode>     Set custom override mode (defaults to 'storybook')"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --android)
            platform="android"
            shift
            ;;
        --ios)
            platform="ios"
            shift
            ;;
        --path=*)
            buildPath="${1#*=}"
            shift
            ;;
        --path)
            buildPath="$2"
            shift 2
            ;;
        --mode=*)
            override_mode="${1#*=}"
            shift
            ;;
        --mode)
            override_mode="$2"
            shift 2
            ;;
        --clear|--clearAll)
            if [[ "$1" == "--clearAll" ]]; then
                clear_all=true
            fi
            clear_mode=true
            shift
            ;;
        *)
            echo "Error: Unknown parameter '$1'"
            show_usage
            ;;
    esac
done

# Handle clearAll mode
if [ "$clear_all" = true ]; then
    echo "Clearing Android Dev:"
    "$0" --android --path="$PROJECT_ROOT/builds/development/android.apk" --clear
    echo -e "\nClearing Android Preview:"
    "$0" --android --path="$PROJECT_ROOT/builds/preview/android.apk" --clear
    echo -e "\nClearing iOS Dev:"
    "$0" --ios --path="$PROJECT_ROOT/builds/development/SherloExpoExample.app" --clear
    echo -e "\nClearing iOS Preview:"
    "$0" --ios --path="$PROJECT_ROOT/builds/preview/SherloExpoExample.app" --clear
    exit 0
fi

# Set config content with the specified or default mode
SHERLO_CONFIG_CONTENT="
{ 
    \"overrideMode\": \"$override_mode\", 
    \"overrideLastState\": {
        \"nextSnapshot\": {
            \"storyId\": \"testing-components-image--resolved\",
            \"parameters\": {
                \"noSafeArea\": false
            }
        },
        \"requestId\": \"fake-request-id\"
    }
}"


# Validate required parameters
if [ -z "$platform" ]; then
    echo "Error: Platform must be specified (--android or --ios)"
    show_usage
fi

if [ -z "$buildPath" ]; then
    echo "Error: Build path must be specified (--path=<path>)"
    show_usage
fi

if [ "$platform" = "android" ]; then
    # Check if AAPT exists
    if [ ! -f "$AAPT_PATH" ]; then
        echo "Error: AAPT not found at $AAPT_PATH"
        exit 1
    fi

    # Check if ADB exists
    if [ ! -f "$ADB_PATH" ]; then
        echo "Error: ADB not found at $ADB_PATH"
        exit 1
    fi

    # Extract package name
    # Expand the buildPath if it contains tilde
    expanded_path="${buildPath/#\~/$HOME}"
    package_name=$("$AAPT_PATH" dump badging "$expanded_path" | grep "package: name" | awk -F"'" '{print $2}')
    
    if [ -z "$package_name" ]; then
        echo "Error: Could not extract package name from APK"
        exit 1
    fi
    
    echo "Android package name: $package_name"

    # Define sherlo path
    sherlo_path="/storage/emulated/0/Android/data/${package_name}/files/sherlo"

    if [ "$clear_mode" = true ]; then
        # Check if directory exists
        if ! "$ADB_PATH" shell "[ -d '$sherlo_path' ]"; then
            echo "Directory does not exist: $sherlo_path"
            exit 1
        fi

        # Remove the config file
        echo "Removing $SHERLO_CONFIG_FILE"
        "$ADB_PATH" shell "rm -f $sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "Successfully removed $SHERLO_CONFIG_FILE"
        else
            echo "Error: Failed to remove $SHERLO_CONFIG_FILE"
            exit 1
        fi
    else
        # Create sherlo directory using adb
        echo "Creating sherlo directory at: $sherlo_path"
        
        "$ADB_PATH" shell "mkdir -p $sherlo_path"
        
        # Verify directory creation
        if [ $? -ne 0 ]; then
            echo "Error: Failed to create sherlo directory"
            exit 1
        fi
        echo "Successfully created sherlo directory"

        # Create config file
        echo "Creating $SHERLO_CONFIG_FILE with content: $SHERLO_CONFIG_CONTENT"
        "$ADB_PATH" shell "echo '$SHERLO_CONFIG_CONTENT' > $sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "Successfully created $SHERLO_CONFIG_FILE"
        else
            echo "Error: Failed to create $SHERLO_CONFIG_FILE"
            exit 1
        fi
    fi

elif [ "$platform" = "ios" ]; then
    # Extract bundle identifier
    bundle_identifier=$(plutil -p "$buildPath/Info.plist" | grep CFBundleIdentifier | awk -F' ' '{print $3}' | tr -d '"')
    
    if [ -z "$bundle_identifier" ]; then
        echo "Error: Could not extract bundle identifier from Info.plist"
        exit 1
    fi
    
    echo "iOS bundle identifier: $bundle_identifier"

    # Get the data container path
    data_container=$(xcrun simctl get_app_container booted "$bundle_identifier" data)
    
    if [ -z "$data_container" ]; then
        echo "Error: Could not get data container path for $bundle_identifier"
        exit 1
    fi

    # Define sherlo directory path
    sherlo_path="${data_container}/Documents/sherlo"

    if [ "$clear_mode" = true ]; then
        # Check if directory exists
        if [ ! -d "$sherlo_path" ]; then
            echo "Directory does not exist: $sherlo_path"
            exit 1
        fi

        # Remove the config file
        echo "Removing $SHERLO_CONFIG_FILE"
        rm -f "$sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "Successfully removed $SHERLO_CONFIG_FILE"
        else
            echo "Error: Failed to remove $SHERLO_CONFIG_FILE"
            exit 1
        fi
    else
        # Create sherlo directory
        echo "Creating sherlo directory at: $sherlo_path"
        mkdir -p "$sherlo_path"
        
        if [ $? -ne 0 ]; then
            echo "Error: Failed to create sherlo directory"
            exit 1
        fi
        echo "Successfully created sherlo directory"

        # Create config file
        echo "Creating $SHERLO_CONFIG_FILE with content: $SHERLO_CONFIG_CONTENT"
        echo "$SHERLO_CONFIG_CONTENT" > "$sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "Successfully created $SHERLO_CONFIG_FILE"
        else
            echo "Error: Failed to create $SHERLO_CONFIG_FILE"
            exit 1
        fi
    fi
fi
