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

/**
 * Standard initialization method
 * @return An initialized instance
 */
- (instancetype)init;

/**
 * Returns constants exposed to the JavaScript side
 * @return Dictionary with mode, config, and lastState
 */
- (NSDictionary *)getSherloConstants;

/**
 * Toggles between Storybook and default modes.
 * If in default mode, switches to Storybook mode; if in Storybook mode, switches to default mode.
 * 
 * @param bridge The React Native bridge needed for reloading
 */
- (void)toggleStorybook:(RCTBridge *)bridge;

/**
 * Switches to Storybook mode.
 * 
 * @param bridge The React Native bridge needed for reloading
 */
- (void)openStorybook:(RCTBridge *)bridge;

/**
 * Switches to default mode.
 * 
 * @param bridge The React Native bridge needed for reloading
 */
- (void)closeStorybook:(RCTBridge *)bridge;

/**
 * Appends base64 encoded content to a file
 * @param filename Name of the file
 * @param content Base64 encoded content to append
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)appendFile:(NSString *)filename withContent:(NSString *)content resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Reads a file and returns its content as base64
 * @param filename Name of the file to read
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)readFile:(NSString *)filename resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Gets inspector data from the current UI hierarchy
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)getInspectorData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

/**
 * Checks if the UI is stable by comparing screenshots
 * @param requiredMatches Number of matching screenshots needed
 * @param minScreenshotsCount Minimum number of screenshots to take when checking for stability
 * @param intervalMs Interval between checks in milliseconds
 * @param timeoutMs Maximum time to wait in milliseconds
 * @param saveScreenshots Whether to save screenshots to filesystem during tests
 * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive
 * @param includeAA If false, ignore anti-aliased pixels when counting differences
 * @param resolve Promise resolver
 * @param reject Promise rejecter
 */
- (void)stabilize:(double)requiredMatches
        minScreenshotsCount:(double)minScreenshotsCount
        intervalMs:(double)intervalMs
        timeoutMs:(double)timeoutMs
        saveScreenshots:(BOOL)saveScreenshots
        threshold:(double)threshold
        includeAA:(BOOL)includeAA
        resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject;

/**
 * Detects if the currently visible screen can be vertically scrolled for long-screenshot capture.
 * Uses read-only view inspection: finds a primary scroll container, checks scroll metrics,
 * and validates with a small programmatic nudge that is immediately restored.
 *
 * @param resolve Promise resolver called with boolean (true if scrollable, false otherwise)
 * @param reject Promise rejecter called if an error occurs
 */
- (void)isScrollableSnapshot:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject;

@end 