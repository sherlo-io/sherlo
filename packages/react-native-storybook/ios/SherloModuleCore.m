#import "SherloModuleCore.h"
#import "FileSystemHelper.h"
#import "InspectorHelper.h"
#import "ConfigHelper.h"
#import "ExpoUpdateHelper.h"
#import "StabilityHelper.h"
#import "KeyboardHelper.h"
#import "LastStateHelper.h"
#import "RestartHelper.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridge.h>

// Mode constants
NSString * const MODE_DEFAULT = @"default";
NSString * const MODE_STORYBOOK = @"storybook";
NSString * const MODE_TESTING = @"testing";

// Module state
static NSDictionary *config;
static NSDictionary *lastState;
static NSString *currentMode;

// Helper instances
static FileSystemHelper *fileSystemHelper;

/**
 * Core implementation for the Sherlo React Native module.
 * Centralizes all business logic and state management for the module.
 * Handles mode switching, file operations, UI inspection, and stability testing.
 */
@implementation SherloModuleCore

/**
 * Initializes a new instance of the SherloModuleCore.
 * Sets up the core module by initializing helpers and loading configuration.
 * Creates file system helper, loads configuration and last state, and determines initial mode.
 *
 * @return A new SherloModuleCore instance
 */
- (instancetype)init {
    self = [super init];
    
    fileSystemHelper = [[FileSystemHelper alloc] init];
    
    config = [ConfigHelper loadConfigWithFileSystemHelper:fileSystemHelper];
    currentMode = [ConfigHelper determineInitialMode:config];
    
    NSLog(@"[SherloModuleCore] Initialized with mode: %ld", (long)currentMode);
    
    if ([currentMode isEqualToString:MODE_TESTING]) {
        [KeyboardHelper setupKeyboardSwizzling];

        lastState = [LastStateHelper loadStateWithFileSystemHelper:fileSystemHelper];
        
        // Check for Expo update deeplink if config exists
        NSString *expoUpdateDeeplink = config[@"expoUpdateDeeplink"];
        
        if (expoUpdateDeeplink) {
            BOOL wasDeeplinkConsumed = [ExpoUpdateHelper wasDeeplinkConsumed];
            
            // If last state is present we don't need to consume the deeplink
            // because expo dev client already points to the correct expo update
            BOOL lastStateHasRequestId = lastState[@"requestId"] != nil;
            
            if (!wasDeeplinkConsumed && !lastStateHasRequestId) {
                NSLog(@"[SherloModuleCore] Consuming expo update deeplink");
                
                NSError *expoUpdateError = nil;
                [ExpoUpdateHelper consumeExpoUpdateDeeplink:expoUpdateDeeplink error:&expoUpdateError];
                
                if (expoUpdateError) {
                    NSLog(@"[SherloModuleCore] Error opening expo deeplink: %@", expoUpdateError.localizedDescription);
                }
            }
        }
    }

    return self;
}

/**
 * Returns constants that will be exposed to JavaScript.
 * Includes mode constants, current mode, and configuration.
 *
 * @return Dictionary of constants
 */
- (NSDictionary *)getConstants {
    return @{
        @"mode": currentMode,
        @"config": config ?: [NSNull null],
        @"lastState": lastState ?: [NSNull null]
    };
}

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)toggleStorybook:(RCTBridge *)bridge {
    if ([currentMode isEqualToString:MODE_STORYBOOK]) {
        currentMode = MODE_DEFAULT;
    } else {
        currentMode = MODE_STORYBOOK;
    }

    [RestartHelper reloadWithBridge:bridge];
}

/**
 * Switches to Storybook mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)openStorybook:(RCTBridge *)bridge {
    currentMode = MODE_STORYBOOK;
    [RestartHelper reloadWithBridge:bridge];
}

/**
 * Switches to default mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 *
 * @param bridge The React Native bridge needed for reloading
 */
- (void)closeStorybook:(RCTBridge *)bridge {
    currentMode = MODE_DEFAULT;
    [RestartHelper reloadWithBridge:bridge];
}

/**
 * Appends base64 encoded content to a file.
 * Creates the file if it doesn't exist, and any necessary parent directories.
 *
 * @param filename The filename relative to the sync directory
 * @param content The base64 encoded content to append
 * @param resolve Promise resolver called when the operation completes
 * @param reject Promise rejecter called if an error occurs
 */
- (void)appendFile:(NSString *)filename withContent:(NSString *)content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [fileSystemHelper appendFileWithPromise:filename base64Content:content resolver:resolve rejecter:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 *
 * @param filename The filename relative to the sync directory
 * @param resolve Promise resolver called with the base64 encoded file content
 * @param reject Promise rejecter called if an error occurs
 */
- (void)readFile:(NSString *)filename resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [fileSystemHelper readFileWithPromise:filename resolver:resolve rejecter:reject];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 * Returns a promise with serialized JSON containing detailed view information.
 *
 * @param resolve Promise resolver called with the inspector data
 * @param reject Promise rejecter called if an error occurs
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [InspectorHelper getInspectorData:resolve rejecter:reject];
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * Returns a promise with a boolean indicating if the UI is stable.
 *
 * @param requiredMatches Number of consecutive matches needed
 * @param intervalMs Time interval in milliseconds
 * @param timeoutMs Timeout in milliseconds
 * @param resolve Promise resolver called with the stability result
 * @param reject Promise rejecter called if an error occurs
 */
- (void)stabilize:(NSInteger)requiredMatches intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [StabilityHelper stabilize:requiredMatches intervalMs:intervalMs timeoutMs:timeoutMs resolver:resolve rejecter:reject];
}

@end 