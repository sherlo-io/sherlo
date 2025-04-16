#import "SherloModule.h"
#import "SherloModuleCore.h"
#import <React/RCTUtils.h>
#import <React/RCTUIManagerUtils.h>
#import <React/RCTBridge.h>

/**
 * Main entry point for the Sherlo React Native module.
 * Implements the RCTBridgeModule protocol to provide JavaScript-accessible functionality
 * and delegates to SherloModuleCore for core implementation.
 */
@implementation SherloModule

/**
 * Required method to register the module with React Native.
 * Sets the module name that will be used to access it from JavaScript.
 */
RCT_EXPORT_MODULE()

@synthesize bridge = _bridge;

static SherloModuleCore *core;

/**
 * Required method to initialize the module.
 * Creates the core instance and initializes it.
 *
 * @return An initialized SherloModule instance
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        core = [[SherloModuleCore alloc] init];
    }
    return self;
}

/**
 * Provides constants that are accessible from JavaScript.
 * These constants include mode values and other configuration.
 *
 * @return Dictionary of constant values
 */
- (NSDictionary *)constantsToExport {
    return [core getConstants];
}

/**
 * Indicates that this module should be initialized on the main thread.
 * This is necessary because the module interacts with UI components.
 *
 * @return YES to initialize on the main thread
 */
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// Specifies the dispatch queue on which the module's methods should be executed.
- (dispatch_queue_t)methodQueue {
    return RCTGetUIManagerQueue();
}

#pragma mark - Exported Methods

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 */
RCT_EXPORT_METHOD(toggleStorybook) {
    [core toggleStorybook:self.bridge];
}

/**
 * Explicitly switches to Storybook mode.
 */
RCT_EXPORT_METHOD(openStorybook) {
    [core openStorybook:self.bridge];
}

/**
 * Explicitly switches to default mode.
 */
RCT_EXPORT_METHOD(closeStorybook) {
    [core closeStorybook:self.bridge];
}

/**
 * Appends base64 encoded content to a file.
 * Creates the file if it doesn't exist, and any necessary parent directories.
 *
 * @param path The file path relative to the sync directory
 * @param content The base64 encoded content to append
 * @param resolve Promise resolver called when the operation completes
 * @param reject Promise rejecter called if an error occurs
 */
RCT_EXPORT_METHOD(appendFile:(NSString *)path
                  withContent:(NSString *)content
                     resolver:(RCTPromiseResolveBlock)resolve
                     rejecter:(RCTPromiseRejectBlock)reject) {
    [core appendFile:path withContent:content resolver:resolve rejecter:reject];
}

/**
 * Reads a file and returns its contents as base64 encoded string.
 *
 * @param path The file path relative to the sync directory
 * @param resolve Promise resolver called with the base64 encoded file content
 * @param reject Promise rejecter called if an error occurs
 */
RCT_EXPORT_METHOD(readFile:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [core readFile:path resolver:resolve rejecter:reject];
}

/**
 * Gets UI inspector data from the current view hierarchy.
 * Returns a promise with serialized JSON containing detailed view information.
 *
 * @param resolve Promise resolver called with the inspector data
 * @param reject Promise rejecter called if an error occurs
 */
RCT_EXPORT_METHOD(getInspectorData:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject) {
    [core getInspectorData:resolve rejecter:reject];
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
RCT_EXPORT_METHOD(stabilize:(NSInteger)requiredMatches
                 intervalMs:(NSInteger)intervalMs
                  timeoutMs:(NSInteger)timeoutMs
                  saveScreenshots:(BOOL)saveScreenshots
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject) {
    [core stabilize:requiredMatches intervalMs:intervalMs timeoutMs:timeoutMs resolver:resolve rejecter:reject];
}

@end
