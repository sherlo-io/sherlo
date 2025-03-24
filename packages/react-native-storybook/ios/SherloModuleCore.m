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

NSString * const MODE_DEFAULT = @"default";
NSString * const MODE_STORYBOOK = @"storybook";
NSString * const MODE_TESTING = @"testing";

/**
 * Core implementation for the Sherlo React Native module.
 * Centralizes all business logic and state management for the module.
 * Handles mode switching, file operations, UI inspection, and stability testing.
 */
@implementation SherloModuleCore

#pragma mark - Lifecycle Methods

/**
 * Initializes a new instance of the SherloModuleCore.
 * Uses the default init method and calls setupCore to initialize dependencies.
 *
 * @return A new SherloModuleCore instance
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        [self setupCore];
    }
    return self;
}

/**
 * Initializes a new instance of the SherloModuleCore with a bridge.
 * Stores the bridge reference and calls setupCore to initialize dependencies.
 *
 * @param bridge The React Native bridge
 * @return A new SherloModuleCore instance
 */
- (instancetype)initWithBridge:(RCTBridge *)bridge {
    self = [super init];
    if (self) {
        _bridge = bridge;
        [self setupCore];
    }
    return self;
}

/**
 * Sets up the core module by initializing helpers and loading configuration.
 * Creates file system helper, loads configuration and last state, and determines initial mode.
 */
- (void)setupCore {
    // Initialize helpers
    _fileSystemHelper = [[FileSystemHelper alloc] init];
    
    // Load configuration
    _config = [ConfigHelper loadConfigWithFileSystemHelper:_fileSystemHelper];
    
    // Load last state
    _lastState = [LastStateHelper loadStateWithFileSystemHelper:_fileSystemHelper];
    
    // Determine initial mode
    _currentMode = [ConfigHelper determineInitialMode:_config];
    
    // Log initialization
    NSLog(@"[SherloModuleCore] Initialized with mode: %ld", (long)_currentMode);
    
    // Setup for testing mode
    if ([_currentMode isEqualToString:MODE_TESTING]) {
        // Setup keyboard swizzling
        [KeyboardHelper setupKeyboardSwizzling];
        
        // Check for Expo update deeplink if config exists
        NSString *expoUpdateDeeplink = _config[@"expoUpdateDeeplink"];
        
        if (expoUpdateDeeplink) {
            BOOL wasDeeplinkConsumed = [ExpoUpdateHelper wasDeeplinkConsumed];
            
            // If last state is present we don't need to consume the deeplink
            // because expo dev client already points to the correct expo update
            BOOL lastStateHasRequestId = _lastState[@"requestId"] != nil;
            
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
}

#pragma mark - Constants

/**
 * Returns constants that will be exposed to JavaScript.
 * Includes mode constants, current mode, and configuration.
 *
 * @return Dictionary of constants
 */
- (NSDictionary *)getConstants {
    return @{
        @"MODE_DEFAULT": @(MODE_DEFAULT),
        @"MODE_STORYBOOK": @(MODE_STORYBOOK),
        @"MODE_TESTING": @(MODE_TESTING),
        @"currentMode": @(self.currentMode),
        @"config": self.config ?: [NSNull null]
    };
}

#pragma mark - Mode Management

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 */
- (void)toggleStorybook {
    if (self.currentMode == MODE_STORYBOOK) {
        [self closeStorybook];
    } else {
        [self openStorybook];
    }
}

/**
 * Switches to Storybook mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 */
- (void)openStorybook {
    if (self.currentMode != MODE_STORYBOOK) {
        self.currentMode = MODE_STORYBOOK;
        
        // Save the new state
        [LastStateHelper saveState:@{@"mode": @(self.currentMode)} withFileSystemHelper:self.fileSystemHelper];
        
        // Reload the application
        [RestartHelper reloadWithBridge:self.bridge];
    }
}

/**
 * Switches to default mode and reloads the React Native application.
 * Updates the current mode, saves state, and triggers a reload.
 */
- (void)closeStorybook {
    if (self.currentMode != MODE_DEFAULT) {
        self.currentMode = MODE_DEFAULT;
        
        // Save the new state
        [LastStateHelper saveState:@{@"mode": @(self.currentMode)} withFileSystemHelper:self.fileSystemHelper];
        
        // Reload the application
        [RestartHelper reloadWithBridge:self.bridge];
    }
}

#pragma mark - File Operations

/**
 * Appends base64 encoded content to a file.
 * Creates the file if it doesn't exist, and any necessary parent directories.
 *
 * @param path The file path relative to the sync directory
 * @param content The base64 encoded content to append
 * @param resolve Promise resolver called when the operation completes
 * @param reject Promise rejecter called if an error occurs
 */
- (void)appendFile:(NSString *)path withContent:(NSString *)content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [self.fileSystemHelper appendFileWithPath:path base64Content:content resolver:resolve rejecter:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 *
 * @param path The file path relative to the sync directory
 * @param resolve Promise resolver called with the base64 encoded file content
 * @param reject Promise rejecter called if an error occurs
 */
- (void)readFile:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    [self.fileSystemHelper readFileWithPath:path resolver:resolve rejecter:reject];
}

#pragma mark - Inspector Methods

/**
 * Gets UI inspector data from the current view hierarchy.
 * Returns a promise with serialized JSON containing detailed view information.
 *
 * @param resolve Promise resolver called with the inspector data
 * @param reject Promise rejecter called if an error occurs
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    if ([self.currentMode isEqualToString:MODE_TESTING]) {
        [InspectorHelper getInspectorDataWithResolver:resolve rejecter:reject];
    } else {
        reject(@"INSPECTOR_NOT_AVAILABLE", @"Inspector is not available", nil);
    }
}

/**
 * Checks UI stability by comparing screenshots taken over a specified interval.
 * Returns a promise with a boolean indicating if the UI is stable.
 *
 * @param delay The delay in milliseconds between stability checks
 * @param resolve Promise resolver called with the stability result
 * @param reject Promise rejecter called if an error occurs
 */
- (void)stabilize:(nonnull NSNumber *)delay resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
    if ([self.currentMode isEqualToString:MODE_TESTING]) {
        [StabilityHelper stabilizeWithDelay:delay resolve:resolve reject:reject];
    } else {
        reject(@"STABILITY_HELPER_NOT_AVAILABLE", @"Stability helper is not available", nil);
    }
}

@end 