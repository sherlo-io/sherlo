#!/bin/bash
#
# Override Sherlo Mode on Simulator Script
#
# Developer tool for debugging. Forces the app to open with a specific mode
# instead of going through the normal app flow. By default, opens in storybook mode
# for quickly testing specific stories without manual navigation.
#
# How it works:
#   1. Extracts package ID (Android) or bundle ID (iOS) from the build file
#   2. Uses that ID to locate the app's data directory on the running simulator/emulator
#   3. Injects a config.sherlo file with override settings
#   4. On next app launch, it reads the config and opens with the specified mode
#
# Important: 
#   - The app must already be installed on the simulator/emulator
#   - The build file path is used ONLY to extract the package/bundle ID
#   - Restart the app after running this script to apply changes
#
# Flags:
#   --android         Target Android emulator
#   --ios             Target iOS simulator
#   --path=<path>     (required) Path to build file (APK or .app) to extract package/bundle ID
#   --mode=<mode>     (optional) Override mode (any string), defaults to "storybook"
#   --clear           Remove config file (app returns to normal behavior)
#   --clearAll        Remove config from all builds at once (dev + preview, Android + iOS)
#
# Usage:
#   # Force app to open in storybook mode on Android
#   ./scripts/override-sherlo-mode-on-simulator.sh --android --path=testing/expo/builds/development/android.apk
#
#   # Force app to open in storybook mode on iOS
#   ./scripts/override-sherlo-mode-on-simulator.sh --ios --path=testing/expo/builds/development/SherloExpoExample.app
#
#   # Remove override (app returns to normal)
#   ./scripts/override-sherlo-mode-on-simulator.sh --android --path=testing/expo/builds/development/android.apk --clear
#
#   # Remove all overrides at once
#   ./scripts/override-sherlo-mode-on-simulator.sh --clearAll
#
#   # Use custom mode
#   ./scripts/override-sherlo-mode-on-simulator.sh --android --path=... --mode=my-custom-mode
#

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
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../testing/expo" && pwd )"

# Function to show usage
show_usage() {
    echo "Usage: $0 (--android | --ios) --path=<build_path> [--clear] [--clearAll] [--mode=<mode>]"
    echo "Options:"
    echo "  --android         Set platform to Android"
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
    echo "🧹 Clearing all device overrides..."
    echo ""
    
    echo "Android Development:"
    "$0" --android --path="$PROJECT_ROOT/builds/development/android.apk" --clear
    echo ""
    
    echo "Android Preview:"
    "$0" --android --path="$PROJECT_ROOT/builds/preview/android.apk" --clear
    echo ""
    
    echo "iOS Development:"
    "$0" --ios --path="$PROJECT_ROOT/builds/development/SherloExpoExample.app" --clear
    echo ""
    
    echo "iOS Preview:"
    "$0" --ios --path="$PROJECT_ROOT/builds/preview/SherloExpoExample.app" --clear
    echo ""
    
    echo "🎉 All overrides cleared!"
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
    echo "✗ Platform must be specified (--android or --ios)"
    show_usage
fi

if [ -z "$buildPath" ]; then
    echo "✗ Build path must be specified (--path=<path>)"
    show_usage
fi

if [ "$clear_mode" = true ]; then
    echo "🧹 Removing device override..."
else
    echo "🔧 Setting device override..."
fi
echo ""

if [ "$platform" = "android" ]; then
    # Check if AAPT exists
    if [ ! -f "$AAPT_PATH" ]; then
        echo "✗ AAPT not found at $AAPT_PATH"
        exit 1
    fi

    # Check if ADB exists
    if [ ! -f "$ADB_PATH" ]; then
        echo "✗ ADB not found at $ADB_PATH"
        exit 1
    fi

    # Extract package name
    # Expand the buildPath if it contains tilde
    expanded_path="${buildPath/#\~/$HOME}"
    package_name=$("$AAPT_PATH" dump badging "$expanded_path" | grep "package: name" | awk -F"'" '{print $2}')
    
    if [ -z "$package_name" ]; then
        echo "✗ Could not extract package name from APK"
        exit 1
    fi
    
    echo "🤖 Android package: $package_name"
    echo ""

    # Define sherlo path
    sherlo_path="/storage/emulated/0/Android/data/${package_name}/files/sherlo"

    if [ "$clear_mode" = true ]; then
        # Check if directory exists
        if ! "$ADB_PATH" shell "[ -d '$sherlo_path' ]"; then
            echo "✗ Directory does not exist: $sherlo_path"
            exit 1
        fi

        # Remove the config file
        echo "Removing override config..."
        "$ADB_PATH" shell "rm -f $sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✓ Override removed - app will use normal behavior"
        else
            echo "✗ Failed to remove config"
            exit 1
        fi
    else
        # Create sherlo directory using adb
        "$ADB_PATH" shell "mkdir -p $sherlo_path"
        
        # Verify directory creation
        if [ $? -ne 0 ]; then
            echo "✗ Failed to create directory"
            exit 1
        fi

        # Create config file
        echo "Injecting override config (mode: $override_mode)..."
        "$ADB_PATH" shell "echo '$SHERLO_CONFIG_CONTENT' > $sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✓ Config injected - restart app to apply"
        else
            echo "✗ Failed to inject config"
            exit 1
        fi
    fi

elif [ "$platform" = "ios" ]; then
    # Extract bundle identifier
    bundle_identifier=$(plutil -p "$buildPath/Info.plist" | grep CFBundleIdentifier | awk -F' ' '{print $3}' | tr -d '"')
    
    if [ -z "$bundle_identifier" ]; then
        echo "✗ Could not extract bundle identifier from Info.plist"
        exit 1
    fi
    
    echo "🍎 iOS bundle: $bundle_identifier"
    echo ""

    # Get the data container path
    data_container=$(xcrun simctl get_app_container booted "$bundle_identifier" data)
    
    if [ -z "$data_container" ]; then
        echo "✗ Could not locate app data container"
        exit 1
    fi

    # Define sherlo directory path
    sherlo_path="${data_container}/Documents/sherlo"

    if [ "$clear_mode" = true ]; then
        # Check if directory exists
        if [ ! -d "$sherlo_path" ]; then
            echo "✗ Directory does not exist: $sherlo_path"
            exit 1
        fi

        # Remove the config file
        echo "Removing override config..."
        rm -f "$sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✓ Override removed - app will use normal behavior"
        else
            echo "✗ Failed to remove config"
            exit 1
        fi
    else
        # Create sherlo directory
        mkdir -p "$sherlo_path"
        
        if [ $? -ne 0 ]; then
            echo "✗ Failed to create directory"
            exit 1
        fi

        # Create config file
        echo "Injecting override config (mode: $override_mode)..."
        echo "$SHERLO_CONFIG_CONTENT" > "$sherlo_path/$SHERLO_CONFIG_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✓ Config injected - restart app to apply"
        else
            echo "✗ Failed to inject config"
            exit 1
        fi
    fi
fi
