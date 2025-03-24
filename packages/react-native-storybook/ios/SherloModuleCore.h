#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@class FileSystemHelper;
@class InspectorHelper;
@class ConfigHelper;
@class LastStateHelper;
@class KeyboardHelper;
@class StabilityHelper;
@class RCTBridge;

/**
 * Core implementation for Sherlo's React Native module.
 * Manages application modes (default, storybook, testing) and provides
 * functionality for file operations, UI inspection, and UI stability testing.
 */
@interface SherloModuleCore : NSObject

// Mode constants
extern NSString * const MODE_DEFAULT;
extern NSString * const MODE_STORYBOOK;
extern NSString * const MODE_TESTING;

/**
 * Standard initialization method
 * @return An initialized instance
 */
- (instancetype)init;

/**
 * Returns constants exposed to the JavaScript side
 * @return Dictionary with mode, config, and lastState
 */
- (NSDictionary *)getConstants;

/**
 * Toggles between Storybook and default modes
 * @param bridge The React Native bridge
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)toggleStorybook:(RCTBridge *)bridge resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Switches to Storybook mode
 * @param bridge The React Native bridge
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)openStorybook:(RCTBridge *)bridge resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Switches to default mode
 * @param bridge The React Native bridge
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)closeStorybook:(RCTBridge *)bridge resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Appends base64 encoded content to a file
 * @param filename Name of the file
 * @param base64Content Base64 encoded content to append
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)appendFile:(NSString *)filename contents:(NSString *)base64Content resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Reads a file and returns its content as base64
 * @param filename Name of the file to read
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)readFile:(NSString *)filename resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Gets inspector data from the current UI hierarchy
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

/**
 * Checks if the UI is stable by comparing screenshots
 * @param requiredMatches Number of matching screenshots needed
 * @param intervalMs Interval between checks in milliseconds
 * @param timeoutMs Maximum time to wait in milliseconds
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)stabilize:(NSInteger)requiredMatches intervalMs:(NSInteger)intervalMs timeoutMs:(NSInteger)timeoutMs resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

@end 